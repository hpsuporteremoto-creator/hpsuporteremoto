import { createClient } from '@supabase/supabase-js';
import {
  getUserRole,
  isAdminUser,
  listAllUsers,
  mergeAppMetadata,
  requireAdmin,
} from './admin-auth';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const updateUserAdminSchema = z.object({
  user_id: uuidSchema,
  is_admin: z.boolean(),
});

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

  const parsed = await readJson(request, updateUserAdminSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { user_id, is_admin } = parsed.data;
  if (user_id === adminCheck.user.id) {
    return json({ error: 'Você não pode alterar seu próprio acesso admin' }, 400);
  }

  const { data: target, error: targetError } =
    await admin.auth.admin.getUserById(user_id);
  if (targetError || !target?.user) {
    return json({ error: 'Usuário não encontrado' }, 404);
  }

  if (!is_admin && isAdminUser(target.user)) {
    const users = await listAllUsers(admin);
    const adminCount = users.filter((user) => isAdminUser(user)).length;
    if (adminCount <= 1) {
      return json({ error: 'Não é possível remover o último administrador' }, 400);
    }
  }

  const { data, error } = await admin.auth.admin.updateUserById(user_id, {
    app_metadata: mergeAppMetadata(target.user.app_metadata, {
      role: is_admin ? 'admin' : 'vendedor',
      is_admin,
    }),
  });
  if (error) return json({ error: error.message }, 500);

  return json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
        role: getUserRole(data.user),
        is_admin: isAdminUser(data.user),
      },
    },
    200,
  );
};
