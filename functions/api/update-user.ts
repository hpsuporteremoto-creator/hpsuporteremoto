import { createClient } from '@supabase/supabase-js';
import { mergeAppMetadata, requireAdmin } from './admin-auth';

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

  const { user_id, full_name } = (body ?? {}) as {
    user_id?: unknown;
    full_name?: unknown;
  };
  if (typeof user_id !== 'string' || user_id.length === 0) {
    return json({ error: 'user_id obrigatório' }, 400);
  }
  if (full_name !== null && typeof full_name !== 'string') {
    return json({ error: 'full_name inválido' }, 400);
  }

  const { data: target, error: targetError } =
    await admin.auth.admin.getUserById(user_id);
  if (targetError || !target?.user) {
    return json({ error: 'Usuário não encontrado no Auth' }, 404);
  }

  const normalizedName = full_name?.trim() || null;
  const { data, error } = await admin.auth.admin.updateUserById(user_id, {
    user_metadata: mergeAppMetadata(target.user.user_metadata, {
      full_name: normalizedName,
      name: normalizedName,
    }),
  });
  if (error) return json({ error: error.message }, 500);

  if (data.user.email) {
    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: data.user.id,
        email: data.user.email.toLowerCase(),
        full_name: normalizedName,
      },
      { onConflict: 'id' },
    );
    if (profileError) return json({ error: profileError.message }, 500);
  }

  return json({ ok: true }, 200);
};
