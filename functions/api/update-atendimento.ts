import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import type { AtendimentoOwnership } from './atendimentos-shared';

type Env = {
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

  const { data: atendimento, error: atendimentoError } = await admin
    .from('atendimentos')
    .select('id, state, criado_por_user_id, vendido_por_user_id, atendido_por_user_id')
    .eq('id', id)
    .maybeSingle<AtendimentoEditRow>();
  if (atendimentoError) return json({ error: atendimentoError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);
  if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
    return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
  }
  if (!EDITABLE_STATES.has(atendimento.state)) {
    return json({ error: 'Somente pedidos em andamento podem ser editados' }, 409);
  }

  const { data: servicos, error: servicosError } = await admin
    .from('servicos')
    .select('id, valor_centavos, ativo')
    .in('id', uniqueServicoIds);
  if (servicosError) return json({ error: servicosError.message }, 500);

  const rows = (servicos ?? []) as ServicoRow[];
  if (rows.length !== uniqueServicoIds.length) {
    return json({ error: 'Um ou mais serviços não foram encontrados' }, 404);
  }
  if (rows.some((servico) => !servico.ativo)) {
    return json({ error: 'Um ou mais serviços estão inativos' }, 400);
  }

  const byId = new Map(rows.map((servico) => [servico.id, servico]));
  const subtotal = servicoItens.reduce((total, item) => {
    const servico = byId.get(item.servico_id);
    return total + (servico?.valor_centavos ?? 0) * item.quantidade;
  }, 0);
  if (subtotal + acrescimoCentavos - descontoCentavos <= 0) {
    return json({ error: 'Os ajustes precisam deixar o total maior que zero' }, 400);
  }

  const patch: Record<string, unknown> = {
    servico_id: servicoIds[0] ?? null,
    servico_ids: servicoIds,
    desconto_centavos: descontoCentavos,
    acrescimo_centavos: acrescimoCentavos,
    descricao_solicitacao: descricaoSolicitacao,
    pix_brcode: null,
    valor_centavos: null,
    state: 'em_andamento',
  };
  if (!atendimento.atendido_por_user_id) {
    patch['atendido_por_user_id'] = staffCheck.user.id;
  }

  const { error } = await admin.from('atendimentos').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true }, 200);
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
