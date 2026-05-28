import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const DELETABLE_STATES = new Set(['aguardando_confirmacao', 'em_andamento']);
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

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const { id } = (body ?? {}) as { id?: unknown };
  if (!isUuidString(id)) return json({ error: 'id inválido' }, 400);

  const { data: atendimento, error: atendimentoError } = await admin
    .from('atendimentos')
    .select('id, state')
    .eq('id', id)
    .maybeSingle<{ id: string; state: string }>();
  if (atendimentoError) return json({ error: atendimentoError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);
  if (!DELETABLE_STATES.has(atendimento.state)) {
    return json({ error: 'Somente pedidos em andamento podem ser excluídos' }, 409);
  }

  const { error: transacoesError } = await admin
    .from('transacoes')
    .delete()
    .eq('atendimento_id', id);
  if (transacoesError) return json({ error: transacoesError.message }, 500);

  const { error } = await admin.from('atendimentos').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true }, 200);
};

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}
