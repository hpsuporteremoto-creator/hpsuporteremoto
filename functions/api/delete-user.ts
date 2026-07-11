import { createClient } from '@supabase/supabase-js';
import { isAdminUser, requireAdmin } from './admin-auth';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const deleteUserSchema = z.object({ user_id: uuidSchema });

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

  const parsed = await readJson(request, deleteUserSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { user_id } = parsed.data;

  if (user_id === adminCheck.user.id) {
    return json({ error: 'Você não pode apagar a si mesmo' }, 400);
  }

  const { data: target, error: fetchErr } =
    await admin.auth.admin.getUserById(user_id);
  if (fetchErr || !target?.user) {
    return json({ error: 'Usuário não encontrado' }, 404);
  }

  if (isAdminUser(target.user)) {
    return json({ error: 'Não é possível apagar outro administrador' }, 400);
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id);
  if (deleteErr) {
    return json({ error: deleteErr.message }, 500);
  }

  return json({ ok: true }, 200);
};
