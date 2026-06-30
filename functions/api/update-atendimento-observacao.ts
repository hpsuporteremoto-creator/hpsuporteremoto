import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import type { AtendimentoOwnership } from './atendimentos-shared';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type AtendimentoObservacaoRow = AtendimentoOwnership & {
  id: string;
  state: string;
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
    id?: unknown;
    descricao_solicitacao?: unknown;
  };
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  const descricaoSolicitacao = normalizeDescription(input.descricao_solicitacao);

  if (!UUID_REGEX.test(id)) return json({ error: 'id inválido' }, 400);

  const { data: atendimento, error: atendimentoError } = await admin
    .from('atendimentos')
    .select('id, state, criado_por_user_id, vendido_por_user_id, atendido_por_user_id')
    .eq('id', id)
    .maybeSingle<AtendimentoObservacaoRow>();
  if (atendimentoError) return json({ error: atendimentoError.message }, 500);
  if (!atendimento) return json({ error: 'Atendimento não encontrado' }, 404);
  if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
    return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
  }
  if (atendimento.state !== 'pagamento') {
    return json({ error: 'Observação só pode ser editada em pagamento' }, 409);
  }

  const { error } = await admin
    .from('atendimentos')
    .update({ descricao_solicitacao: descricaoSolicitacao })
    .eq('id', id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true }, 200);
};

function normalizeDescription(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
