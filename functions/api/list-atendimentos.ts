import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';
import {
  ATENDIMENTO_SELECT,
  hydrateServicosSolicitados,
} from './atendimentos-shared';
import type {
  AtendimentoComRelacoes,
  AtendimentoState,
} from './atendimentos-shared';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const ALLOWED_FILTERS = new Set<AtendimentoState | 'novos'>([
  'novos',
  'em_andamento',
  'pagamento',
  'concluido',
  'recusado',
]);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter') ?? 'novos';
  if (!ALLOWED_FILTERS.has(filter as AtendimentoState | 'novos')) {
    return json({ error: 'Filtro inválido' }, 400);
  }
  const clienteId = url.searchParams.get('clienteId')?.trim();
  const todosOsStatus = url.searchParams.get('todosOsStatus') === 'true';

  let query = admin
    .from('atendimentos')
    .select(ATENDIMENTO_SELECT)
    .order('created_at', { ascending: false });

  if (!todosOsStatus) {
    const state = filter === 'novos' ? 'aguardando_confirmacao' : filter;
    query = query.eq('state', state);
  }

  if (clienteId) {
    query = query.eq('cliente_id', clienteId);
  }

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  try {
    const atendimentos = await hydrateServicosSolicitados(
      admin,
      (data ?? []) as unknown as AtendimentoComRelacoes[],
    );
    return json({ atendimentos }, 200);
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'Erro ao carregar serviços' },
      500,
    );
  }
};
