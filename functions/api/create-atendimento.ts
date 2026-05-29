import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ServicoRow = {
  id: string;
  valor_centavos: number;
};

type ServicoItem = {
  servico_id: string;
  quantidade: number;
};

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
    cliente_id?: unknown;
    servico_itens?: unknown;
    servico_ids?: unknown;
    desconto_centavos?: unknown;
    descricao_solicitacao?: unknown;
  };
  const clienteId = typeof input.cliente_id === 'string' ? input.cliente_id : '';
  const servicoItens = normalizeServicoItens(input.servico_itens, input.servico_ids);
  const servicoIds = expandServicoIds(servicoItens);
  const uniqueServicoIds = Array.from(new Set(servicoItens.map((item) => item.servico_id)));
  const descontoCentavos =
    typeof input.desconto_centavos === 'number' &&
    Number.isInteger(input.desconto_centavos) &&
    input.desconto_centavos >= 0
      ? input.desconto_centavos
      : 0;
  const descricaoSolicitacao =
    typeof input.descricao_solicitacao === 'string' && input.descricao_solicitacao.trim().length > 0
      ? input.descricao_solicitacao.trim()
      : null;

  if (!isUuidString(clienteId)) return json({ error: 'cliente_id inválido' }, 400);
  if (servicoItens.length === 0) {
    return json({ error: 'Escolha ao menos um serviço' }, 400);
  }

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .select('id, ativo')
    .eq('id', clienteId)
    .eq('ativo', true)
    .maybeSingle<{ id: string; ativo: boolean }>();
  if (clienteError) return json({ error: clienteError.message }, 500);
  if (!cliente) return json({ error: 'Cliente ativo não encontrado' }, 404);

  const { data: servicos, error: servicosError } = await admin
    .from('servicos')
    .select('id, valor_centavos')
    .in('id', uniqueServicoIds)
    .eq('ativo', true);
  if (servicosError) return json({ error: servicosError.message }, 500);
  const rows = (servicos ?? []) as ServicoRow[];
  if (rows.length !== uniqueServicoIds.length) {
    return json({ error: 'Um ou mais serviços não estão ativos' }, 400);
  }

  const byId = new Map(rows.map((servico) => [servico.id, servico]));
  const subtotal = servicoItens.reduce((total, item) => {
    const servico = byId.get(item.servico_id);
    return total + (servico?.valor_centavos ?? 0) * item.quantidade;
  }, 0);
  if (subtotal > 0 && descontoCentavos >= subtotal) {
    return json({ error: 'O desconto precisa ser menor que o subtotal' }, 400);
  }

  const { data, error } = await admin
    .from('atendimentos')
    .insert({
      cliente_id: clienteId,
      servico_id: servicoIds[0] ?? null,
      servico_ids: servicoIds,
      desconto_centavos: descontoCentavos,
      descricao_solicitacao: descricaoSolicitacao,
      criado_por_user_id: staffCheck.user.id,
      vendido_por_user_id: staffCheck.user.id,
      atendido_por_user_id: staffCheck.user.id,
      state: 'em_andamento',
    })
    .select('id')
    .single<{ id: string }>();

  if (error || !data) {
    return json({ error: error?.message ?? 'Falha ao criar atendimento' }, 500);
  }

  return json({ id: data.id }, 201);
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
  const normalized = legacyServicoIds.flatMap((id): ServicoItem[] =>
    isUuidString(id) ? [{ servico_id: id, quantidade: 1 }] : [],
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
