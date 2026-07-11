import { createClient } from '@supabase/supabase-js';
import { and, eq, inArray } from 'drizzle-orm';
import { atendimentos, servicos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import type { AtendimentoOwnership } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';

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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const input = body as {
    id?: unknown;
    servico_itens?: unknown;
    servico_ids?: unknown;
    desconto_centavos?: unknown;
    acrescimo_centavos?: unknown;
    descricao_solicitacao?: unknown;
  };
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const servicoItens = normalizeServicoItens(input.servico_itens, input.servico_ids);
  const servicoIds = expandServicoIds(servicoItens);
  const uniqueServicoIds = Array.from(new Set(servicoItens.map((item) => item.servico_id)));
  const descontoCentavos =
    typeof input.desconto_centavos === 'number' &&
    Number.isInteger(input.desconto_centavos) &&
    input.desconto_centavos >= 0
      ? input.desconto_centavos
      : -1;
  const acrescimoCentavos =
    typeof input.acrescimo_centavos === 'number' &&
    Number.isInteger(input.acrescimo_centavos) &&
    input.acrescimo_centavos >= 0
      ? input.acrescimo_centavos
      : -1;
  const descricaoSolicitacao =
    typeof input.descricao_solicitacao === 'string' && input.descricao_solicitacao.trim().length > 0
      ? input.descricao_solicitacao.trim()
      : null;

  if (!isUuidString(id)) return json({ error: 'id inválido' }, 400);
  if (servicoItens.length === 0) return json({ error: 'Escolha ao menos um serviço' }, 400);
  if (descontoCentavos < 0) return json({ error: 'Desconto inválido' }, 400);
  if (acrescimoCentavos < 0) return json({ error: 'Acréscimo inválido' }, 400);

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

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function normalizeServicoItens(servicoItens: unknown, legacyServicoIds: unknown): ServicoItem[] {
  if (Array.isArray(servicoItens)) {
    const normalized = servicoItens.flatMap((item): ServicoItem[] => {
      if (!item || typeof item !== 'object') return [];
      const record = item as { servico_id?: unknown; quantidade?: unknown };
      if (!isUuidString(record.servico_id)) return [];
      const quantidade = normalizeQuantidade(record.quantidade);
      return quantidade > 0 ? [{ servico_id: record.servico_id, quantidade }] : [];
    });
    return mergeServicoItens(normalized);
  }

  if (!Array.isArray(legacyServicoIds)) return [];
  const normalized = legacyServicoIds.flatMap((servicoId): ServicoItem[] =>
    isUuidString(servicoId) ? [{ servico_id: servicoId, quantidade: 1 }] : [],
  );
  return mergeServicoItens(normalized);
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

function normalizeQuantidade(value: unknown): number {
  const quantidade = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(quantidade) || quantidade < 1) return 0;
  return Math.min(quantidade, 99);
}
