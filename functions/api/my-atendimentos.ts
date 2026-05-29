import { createClient } from '@supabase/supabase-js';
import { ATENDIMENTO_SELECT, hydrateServicosSolicitados } from './atendimentos-shared';
import type { AtendimentoComRelacoes } from './atendimentos-shared';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ClienteIdRow = {
  id: string;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Entre com Google para ver seus pedidos.' }, 401);
  }

  const token = authHeader.slice('bearer '.length).trim();
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  const email = user?.email?.trim();
  if (authError || !email) {
    return json({ error: 'Sessão inválida' }, 401);
  }

  const { data: clientes, error: clientesError } = await admin
    .from('clientes')
    .select('id')
    .ilike('email', email);
  if (clientesError) return json({ error: clientesError.message }, 500);

  const clienteIds = ((clientes ?? []) as ClienteIdRow[]).map((cliente) => cliente.id);
  if (clienteIds.length === 0) return json({ atendimentos: [] }, 200);

  const { data, error } = await admin
    .from('atendimentos')
    .select(ATENDIMENTO_SELECT)
    .in('cliente_id', clienteIds)
    .order('created_at', { ascending: false });
  if (error) return json({ error: error.message }, 500);

  try {
    const atendimentos = await hydrateServicosSolicitados(
      admin,
      (data ?? []) as unknown as AtendimentoComRelacoes[],
    );
    return json({ atendimentos: atendimentos.map(toPublicAtendimento) }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao carregar serviços' }, 500);
  }
};

function toPublicAtendimento(atendimento: AtendimentoComRelacoes): Record<string, unknown> {
  const {
    criado_por_user_id: _createdById,
    vendido_por_user_id: _soldById,
    atendido_por_user_id: _attendedById,
    criado_por: _createdBy,
    vendido_por: _soldBy,
    atendido_por: _attendedBy,
    financeiro_contabilizado: _accounting,
    financeiro_transacao_id: _transactionId,
    transacoes: _transactions,
    ...publicAtendimento
  } = atendimento;
  return publicAtendimento;
}
