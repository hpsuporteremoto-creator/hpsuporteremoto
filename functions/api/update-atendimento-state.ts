import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';
import {
  ATENDIMENTO_OWNERSHIP_SELECT,
  canStaffAccessAtendimento,
} from './atendimentos-shared';
import type { AtendimentoOwnership, AtendimentoState } from './atendimentos-shared';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const ALLOWED_STATES = new Set<AtendimentoState>([
  'aguardando_confirmacao',
  'recusado',
  'em_andamento',
  'pagamento',
  'concluido',
]);

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

  const { id, state } = (body ?? {}) as { id?: unknown; state?: unknown };
  if (typeof id !== 'string' || id.length === 0) {
    return json({ error: 'id obrigatório' }, 400);
  }
  if (typeof state !== 'string' || !ALLOWED_STATES.has(state as AtendimentoState)) {
    return json({ error: 'state inválido' }, 400);
  }
  if (state === 'recusado' && staffCheck.role !== 'admin') {
    return json({ error: 'Apenas administradores podem cancelar atendimentos' }, 403);
  }

  const { data: atendimento, error: atendimentoError } = await admin
    .from('atendimentos')
    .select(ATENDIMENTO_OWNERSHIP_SELECT)
    .eq('id', id)
    .maybeSingle<AtendimentoOwnership>();
  if (atendimentoError) return json({ error: atendimentoError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);
  if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
    return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
  }

  const patch: Record<string, unknown> = { state };
  if (state === 'em_andamento') {
    patch['atendido_por_user_id'] = staffCheck.user.id;
  }

  const { error } = await admin.from('atendimentos').update(patch).eq('id', id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true }, 200);
};
