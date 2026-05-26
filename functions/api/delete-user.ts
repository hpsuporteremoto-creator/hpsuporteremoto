import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

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

  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Authorization Bearer token ausente' }, 401);
  }
  const token = authHeader.slice('bearer '.length).trim();

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await admin.auth.getUser(token);

  if (callerError || !caller?.email) {
    return json({ error: 'Token inválido' }, 401);
  }
  const callerAdmin = await getProfileIsAdmin(admin, caller.id);
  if (callerAdmin.error) {
    return json({ error: callerAdmin.error }, 500);
  }
  if (!callerAdmin.isAdmin) {
    return json({ error: 'Acesso restrito a administradores' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }
  const { user_id } = (body ?? {}) as { user_id?: unknown };
  if (typeof user_id !== 'string' || user_id.length === 0) {
    return json({ error: 'user_id obrigatório' }, 400);
  }

  if (user_id === caller.id) {
    return json({ error: 'Você não pode apagar a si mesmo' }, 400);
  }

  const { data: target, error: fetchErr } =
    await admin.auth.admin.getUserById(user_id);
  if (fetchErr || !target?.user) {
    return json({ error: 'Usuário não encontrado' }, 404);
  }

  const targetAdmin = await getProfileIsAdmin(admin, target.user.id);
  if (targetAdmin.error) {
    return json({ error: targetAdmin.error }, 500);
  }
  if (targetAdmin.isAdmin) {
    return json({ error: 'Não é possível apagar outro administrador' }, 400);
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id);
  if (deleteErr) {
    return json({ error: deleteErr.message }, 500);
  }

  return json({ ok: true }, 200);
};

async function getProfileIsAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<{ isAdmin: boolean; error: string | null }> {
  const { data, error } = await admin
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle<{ is_admin: boolean }>();
  if (error) return { isAdmin: false, error: error.message };
  return { isAdmin: data?.is_admin === true, error: null };
}
