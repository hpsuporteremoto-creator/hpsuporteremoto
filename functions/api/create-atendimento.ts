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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    servico_ids?: unknown;
    desconto_centavos?: unknown;
    descricao_solicitacao?: unknown;
  };
  const clienteId = typeof input.cliente_id === 'string' ? input.cliente_id : '';
  const servicoIds = Array.isArray(input.servico_ids)
    ? Array.from(new Set(input.servico_ids.filter(isUuidString)))
    : [];
  const descontoCentavos =
    typeof input.desconto_centavos === 'number' &&
    Number.isInteger(input.desconto_centavos) &&
    input.desconto_centavos >= 0
      ? input.desconto_centavos
      : 0;
  const descricaoSolicitacao =
    typeof input.descricao_solicitacao === 'string' &&
    input.descricao_solicitacao.trim().length > 0
      ? input.descricao_solicitacao.trim()
      : null;

  if (!isUuidString(clienteId)) return json({ error: 'cliente_id inválido' }, 400);
  if (servicoIds.length === 0) {
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
    .in('id', servicoIds)
    .eq('ativo', true);
  if (servicosError) return json({ error: servicosError.message }, 500);
  const rows = (servicos ?? []) as ServicoRow[];
  if (rows.length !== servicoIds.length) {
    return json({ error: 'Um ou mais serviços não estão ativos' }, 400);
  }

  const subtotal = rows.reduce((total, servico) => total + servico.valor_centavos, 0);
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
