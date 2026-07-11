import { createClient } from '@supabase/supabase-js';
import { and, eq, inArray } from 'drizzle-orm';
import { atendimentos, servicos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import type { AtendimentoOwnership } from './atendimentos-shared';
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

type ServicoRow = {
  id: string;
  valor_centavos: number;
  ativo: boolean;
};

type AtendimentoEditRow = AtendimentoOwnership & {
  id: string;
  state: string;
};

const EDITABLE_STATES = new Set(['aguardando_confirmacao', 'em_andamento']);
const servicoItemSchema = z.object({
  servico_id: uuidSchema,
  quantidade: z.number().int().min(1).max(99, 'Quantidade máxima é 99'),
});

const atendimentoUpdateSchema = z
  .object({
    id: uuidSchema,
    servico_itens: z.array(servicoItemSchema).min(1, 'Escolha ao menos um serviço').optional(),
    servico_ids: z.array(uuidSchema).min(1, 'Escolha ao menos um serviço').optional(),
    desconto_centavos: nonNegativeIntegerSchema,
    acrescimo_centavos: nonNegativeIntegerSchema,
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

  const parsed = await readJson(request, atendimentoUpdateSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.data;
  const id = input.id;
  const servicoItens = mergeServicoItens(
    input.servico_itens ?? input.servico_ids!.map((servico_id) => ({ servico_id, quantidade: 1 })),
  );
  const servicoIds = expandServicoIds(servicoItens);
  const uniqueServicoIds = Array.from(new Set(servicoItens.map((item) => item.servico_id)));
  const descontoCentavos = input.desconto_centavos;
  const acrescimoCentavos = input.acrescimo_centavos;
  const descricaoSolicitacao = input.descricao_solicitacao;

  try {
    const result = await withDatabase(env, async (db) => {
      const [atendimento] = await db
        .select({
          state: atendimentos.state,
          criado_por_user_id: atendimentos.criadoPorUserId,
          vendido_por_user_id: atendimentos.vendidoPorUserId,
          atendido_por_user_id: atendimentos.atendidoPorUserId,
        })
        .from(atendimentos)
        .where(eq(atendimentos.id, id));
      if (!atendimento) return 'not-found' as const;
      if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) return 'forbidden' as const;
      if (!EDITABLE_STATES.has(atendimento.state)) return 'locked' as const;
      const rows = await db
        .select({ id: servicos.id, valor_centavos: servicos.valorCentavos, ativo: servicos.ativo })
        .from(servicos)
        .where(inArray(servicos.id, uniqueServicoIds));
      if (rows.length !== uniqueServicoIds.length) return 'missing-services' as const;
      if (rows.some((servico) => !servico.ativo)) return 'inactive-services' as const;
      const byId = new Map(rows.map((servico) => [servico.id, servico]));
      const subtotal = servicoItens.reduce(
        (total, item) => total + (byId.get(item.servico_id)?.valor_centavos ?? 0) * item.quantidade,
        0,
      );
      if (subtotal + acrescimoCentavos - descontoCentavos <= 0) return 'invalid-total' as const;
      await db
        .update(atendimentos)
        .set({
          servicoId: servicoIds[0] ?? null,
          servicoIds,
          descontoCentavos,
          acrescimoCentavos,
          descricaoSolicitacao,
          pixBrcode: null,
          valorCentavos: null,
          state: 'em_andamento',
          ...(!atendimento.atendido_por_user_id ? { atendidoPorUserId: staffCheck.user.id } : {}),
        })
        .where(eq(atendimentos.id, id));
      return 'ok' as const;
    });
    if (result === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
    if (result === 'forbidden') return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
    if (result === 'locked') return json({ error: 'Somente pedidos em andamento podem ser editados' }, 409);
    if (result === 'missing-services') return json({ error: 'Um ou mais serviços não foram encontrados' }, 404);
    if (result === 'inactive-services') return json({ error: 'Um ou mais serviços estão inativos' }, 400);
    if (result === 'invalid-total') return json({ error: 'Os ajustes precisam deixar o total maior que zero' }, 400);
    return json({ ok: true }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao atualizar atendimento' }, 500);
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
