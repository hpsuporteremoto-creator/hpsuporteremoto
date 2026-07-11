import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  buildBrCodeRef,
  generateStaticBrCode,
  projectCity,
  projectReceiverName,
} from '@thiagoprazeres/pix-static-brcode';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import type { AtendimentoOwnership } from './atendimentos-shared';
import {
  atendimentos,
  pixRecebedorConfig,
  pixRecebedores,
  servicos as servicosTable,
} from '../../drizzle/schema';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { nonNegativeIntegerSchema, readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  PIX_KEY?: string;
  PIX_RECEIVER_NAME?: string;
  PIX_RECEIVER_CITY?: string;
};

type Context = { request: Request; env: Env };

type PixReceiverConfig = {
  id: string | null;
  pixKey: string;
  receiverName: string;
  receiverCity: string;
};

type ServicoItem = {
  servico_id: string;
  quantidade: number;
};

type AtendimentoPixRow = AtendimentoOwnership & {
  id: string;
  state: string;
  desconto_centavos: number | null;
  acrescimo_centavos: number | null;
};

const servicoItemSchema = z.object({
  servico_id: uuidSchema,
  quantidade: z.number().int().min(1).max(99, 'Quantidade máxima é 99'),
});

const pixGenerationSchema = z
  .object({
    atendimento_id: uuidSchema,
    servico_id: uuidSchema.optional(),
    servico_ids: z.array(uuidSchema).min(1, 'Escolha ao menos um serviço').optional(),
    servico_itens: z.array(servicoItemSchema).min(1, 'Escolha ao menos um serviço').optional(),
    desconto_centavos: nonNegativeIntegerSchema.optional(),
    acrescimo_centavos: nonNegativeIntegerSchema.optional(),
    pix_recebedor_id: uuidSchema.nullable().optional().transform((value) => value ?? null),
    descricao_solicitacao: z
      .string()
      .trim()
      .max(20_000)
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .refine((value) => Boolean(value.servico_itens ?? value.servico_ids ?? value.servico_id), {
    message: 'Escolha ao menos um serviço',
    path: ['servico_itens'],
  });

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const parsed = await readJson(request, pixGenerationSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.data;
  const atendimentoId = input.atendimento_id;
  const servicoItens = mergeServicoItens(
    input.servico_itens ??
      input.servico_ids?.map((servico_id) => ({ servico_id, quantidade: 1 })) ??
      [{ servico_id: input.servico_id!, quantidade: 1 }],
  );
  const servicoIds = expandServicoIds(servicoItens);
  const uniqueServicoIds = Array.from(new Set(servicoItens.map((item) => item.servico_id)));
  const atendimento = await withDatabase(env, async (db) => {
    const [row] = await db
      .select({
        id: atendimentos.id,
        state: atendimentos.state,
        desconto_centavos: atendimentos.descontoCentavos,
        acrescimo_centavos: atendimentos.acrescimoCentavos,
        criado_por_user_id: atendimentos.criadoPorUserId,
        vendido_por_user_id: atendimentos.vendidoPorUserId,
        atendido_por_user_id: atendimentos.atendidoPorUserId,
      })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId));
    return row ?? null;
  });
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);
  if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
    return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
  }

  if (
    atendimento.state !== 'em_andamento' &&
    atendimento.state !== 'aguardando_confirmacao' &&
    atendimento.state !== 'pagamento'
  ) {
    return json(
      {
        error: `PIX só pode ser gerado quando o atendimento está em em_andamento ou pagamento (state atual: ${atendimento.state})`,
      },
      409,
    );
  }

  const servicosData = await withDatabase(env, (db) =>
    db
      .select({ id: servicosTable.id, nome: servicosTable.nome, valor_centavos: servicosTable.valorCentavos, ativo: servicosTable.ativo })
      .from(servicosTable)
      .where(inArray(servicosTable.id, uniqueServicoIds)),
  );
  const servicos = servicosData;
  const byId = new Map(servicos.map((servico) => [servico.id, servico]));
  const orderedServicos = servicoItens.flatMap((item) => {
    const servico = byId.get(item.servico_id);
    return servico ? [{ ...servico, quantidade: item.quantidade }] : [];
  });

  if (orderedServicos.length !== servicoItens.length) {
    return json({ error: 'Um ou mais serviços não foram encontrados' }, 404);
  }
  const inactive = orderedServicos.find((servico) => !servico.ativo);
  if (inactive) return json({ error: `Serviço inativo: ${inactive.nome}` }, 400);

  const invalid = orderedServicos.find(
    (servico) => typeof servico.valor_centavos !== 'number' || servico.valor_centavos <= 0,
  );
  if (invalid) {
    return json({ error: `Serviço com valor inválido: ${invalid.nome}` }, 400);
  }
  const subtotalCentavos = orderedServicos.reduce(
    (total, servico) => total + servico.valor_centavos * servico.quantidade,
    0,
  );
  const descontoCentavos = input.desconto_centavos ?? Math.max(atendimento.desconto_centavos ?? 0, 0);
  const acrescimoCentavos = input.acrescimo_centavos ?? Math.max(atendimento.acrescimo_centavos ?? 0, 0);
  const descricaoSolicitacao = input.descricao_solicitacao;

  if (subtotalCentavos + acrescimoCentavos - descontoCentavos <= 0) {
    return json({ error: 'Os ajustes precisam deixar o total maior que zero' }, 400);
  }

  const totalCentavos = subtotalCentavos + acrescimoCentavos - descontoCentavos;
  const receiverConfig = await getPixReceiverConfig(env, input.pix_recebedor_id);
  if ('error' in receiverConfig) return json({ error: receiverConfig.error }, 500);

  let brcode: string;
  try {
    brcode = generateStaticBrCode({
      pixKey: receiverConfig.pixKey,
      receiverName: projectReceiverName(receiverConfig.receiverName),
      receiverCity: projectCity(receiverConfig.receiverCity),
      referenceLabel: buildBrCodeRef(atendimentoId),
      amount: totalCentavos / 100,
    });
  } catch (err) {
    return json(
      {
        error: `Falha ao gerar BR Code: ${err instanceof Error ? err.message : String(err)}`,
      },
      500,
    );
  }

  try {
    await withDatabase(env, (db) =>
      db
        .update(atendimentos)
        .set({
          pixBrcode: brcode,
          valorCentavos: totalCentavos,
          descontoCentavos,
          acrescimoCentavos,
          descricaoSolicitacao,
          pixRecebedorId: receiverConfig.id,
          servicoId: servicoIds[0] ?? null,
          servicoIds,
          vendidoPorUserId: staffCheck.user.id,
          atendidoPorUserId: staffCheck.user.id,
          state: 'pagamento',
        })
        .where(eq(atendimentos.id, atendimentoId)),
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao salvar PIX' }, 500);
  }

  return json(
    {
      pix_brcode: brcode,
      subtotal_centavos: subtotalCentavos,
      desconto_centavos: descontoCentavos,
      acrescimo_centavos: acrescimoCentavos,
      valor_centavos: totalCentavos,
      pix_recebedor_id: receiverConfig.id,
      state: 'pagamento',
    },
    200,
  );
};

async function getPixReceiverConfig(
  env: Env,
  selectedReceiverId: string | null,
): Promise<PixReceiverConfig | { error: string }> {
  let receiver: { id: string; pixKey: string; receiverName: string; receiverCity: string } | null;
  try {
    receiver = await withDatabase(env, async (db) => {
      const query = db
        .select({
          id: pixRecebedores.id,
          pixKey: pixRecebedores.pixKey,
          receiverName: pixRecebedores.receiverName,
          receiverCity: pixRecebedores.receiverCity,
        })
        .from(pixRecebedores);
      const rows = selectedReceiverId
        ? await query.where(and(eq(pixRecebedores.id, selectedReceiverId), eq(pixRecebedores.ativo, true)))
        : await query
            .where(eq(pixRecebedores.ativo, true))
            .orderBy(desc(pixRecebedores.padrao), asc(pixRecebedores.receiverName));
      return rows[0] ?? null;
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erro ao carregar recebedor PIX' };
  }

  if (selectedReceiverId && !receiver) {
    return { error: 'A chave PIX selecionada não está disponível' };
  }
  if (receiver && isCompleteReceiverConfig(receiver)) return receiver;

  let legacy: { pixKey: string; receiverName: string; receiverCity: string } | null;
  try {
    legacy = await withDatabase(env, async (db) => {
      const [row] = await db
        .select({
          pixKey: pixRecebedorConfig.pixKey,
          receiverName: pixRecebedorConfig.receiverName,
          receiverCity: pixRecebedorConfig.receiverCity,
        })
        .from(pixRecebedorConfig)
        .where(eq(pixRecebedorConfig.id, 1));
      return row ?? null;
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Erro ao carregar recebedor PIX' };
  }

  const dbConfig = {
    id: null,
    pixKey: legacy?.pixKey.trim() ?? '',
    receiverName: legacy?.receiverName.trim() ?? '',
    receiverCity: legacy?.receiverCity.trim() ?? '',
  };
  if (isCompleteReceiverConfig(dbConfig)) return dbConfig;

  const envConfig = {
    id: null,
    pixKey: env.PIX_KEY?.trim() ?? '',
    receiverName: env.PIX_RECEIVER_NAME?.trim() ?? '',
    receiverCity: env.PIX_RECEIVER_CITY?.trim() ?? '',
  };
  if (isCompleteReceiverConfig(envConfig)) return envConfig;

  return {
    error: 'Configure o recebedor PIX em Financeiro > Recebedor PIX antes de gerar cobrança.',
  };
}

function isCompleteReceiverConfig(config: PixReceiverConfig): boolean {
  return (
    config.pixKey.length > 0 && config.receiverName.length > 0 && config.receiverCity.length > 0
  );
}

function mergeServicoItens(items: ServicoItem[]): ServicoItem[] {
  const byId = new Map<string, number>();
  for (const item of items) {
    byId.set(item.servico_id, (byId.get(item.servico_id) ?? 0) + item.quantidade);
  }
  return Array.from(byId.entries()).map(([servico_id, quantidade]) => ({
    servico_id,
    quantidade,
  }));
}

function expandServicoIds(items: readonly ServicoItem[]): string[] {
  return items.flatMap((item) => Array.from({ length: item.quantidade }, () => item.servico_id));
}
