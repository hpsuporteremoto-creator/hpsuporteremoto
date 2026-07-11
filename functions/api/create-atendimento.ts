import { createClient } from '@supabase/supabase-js';
import { and, eq, inArray } from 'drizzle-orm';
import { atendimentos, clientes, servicos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { nonNegativeIntegerSchema, readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ServicoItem = {
  servico_id: string;
  quantidade: number;
};

const servicoItemSchema = z.object({
  servico_id: uuidSchema,
  quantidade: z.number().int().min(1).max(99, 'Quantidade máxima é 99'),
});

const atendimentoCreateSchema = z
  .object({
    cliente_id: uuidSchema,
    servico_itens: z.array(servicoItemSchema).min(1, 'Escolha ao menos um serviço').optional(),
    servico_ids: z.array(uuidSchema).min(1, 'Escolha ao menos um serviço').optional(),
    desconto_centavos: nonNegativeIntegerSchema.optional().default(0),
    acrescimo_centavos: nonNegativeIntegerSchema.optional().default(0),
    descricao_solicitacao: z
      .string()
      .trim()
      .max(20_000)
      .nullable()
      .optional()
      .transform((value) => value || null),
  })
  .refine((value) => Boolean(value.servico_itens ?? value.servico_ids), {
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

  const parsed = await readJson(request, atendimentoCreateSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.data;
  const clienteId = input.cliente_id;
  const servicoItens = mergeServicoItens(
    input.servico_itens ?? input.servico_ids!.map((servico_id) => ({ servico_id, quantidade: 1 })),
  );
  const servicoIds = expandServicoIds(servicoItens);
  const uniqueServicoIds = Array.from(new Set(servicoItens.map((item) => item.servico_id)));
  const descontoCentavos = input.desconto_centavos;
  const acrescimoCentavos = input.acrescimo_centavos;
  const descricaoSolicitacao = input.descricao_solicitacao;

  try {
    const id = await withDatabase(env, async (db) => {
      const [cliente] = await db
        .select({ id: clientes.id })
        .from(clientes)
        .where(and(eq(clientes.id, clienteId), eq(clientes.ativo, true)));
      if (!cliente) return null;
      const rows = await db
        .select({ id: servicos.id, valor_centavos: servicos.valorCentavos })
        .from(servicos)
        .where(and(inArray(servicos.id, uniqueServicoIds), eq(servicos.ativo, true)));
      if (rows.length !== uniqueServicoIds.length) throw new Error('Um ou mais serviços não estão ativos');
      const byId = new Map(rows.map((servico) => [servico.id, servico]));
      const subtotal = servicoItens.reduce(
        (total, item) => total + (byId.get(item.servico_id)?.valor_centavos ?? 0) * item.quantidade,
        0,
      );
      if (subtotal + acrescimoCentavos - descontoCentavos <= 0) {
        throw new Error('Os ajustes precisam deixar o total maior que zero');
      }
      const [atendimento] = await db
        .insert(atendimentos)
        .values({
          clienteId,
          servicoId: servicoIds[0] ?? null,
          servicoIds,
          descontoCentavos,
          acrescimoCentavos,
          descricaoSolicitacao,
          criadoPorUserId: staffCheck.user.id,
          vendidoPorUserId: staffCheck.user.id,
          atendidoPorUserId: staffCheck.user.id,
          state: 'em_andamento',
        })
        .returning({ id: atendimentos.id });
      return atendimento?.id ?? null;
    });
    if (!id) return json({ error: 'Cliente ativo não encontrado' }, 404);
    return json({ id }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Falha ao criar atendimento' }, 400);
  }
};

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
