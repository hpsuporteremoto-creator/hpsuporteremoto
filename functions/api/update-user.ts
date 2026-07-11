import { createClient } from '@supabase/supabase-js';
import { profiles } from '../../drizzle/schema';
import {
  getUserRole,
  isAdminUser,
  listAllUsers,
  mergeAppMetadata,
  requireAdmin,
} from './admin-auth';
import type { UserRole } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
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
  const role = parseOptionalUserRole((body as { role?: unknown })?.role);
  if (typeof user_id !== 'string' || user_id.length === 0) {
    return json({ error: 'user_id obrigatório' }, 400);
  }
  if (full_name !== null && typeof full_name !== 'string') {
    return json({ error: 'full_name inválido' }, 400);
  }
  if (role === 'invalid') {
    return json({ error: 'Perfil de acesso inválido' }, 400);
  }
  if (role && user_id === adminCheck.user.id && role !== getUserRole(adminCheck.user)) {
    return json({ error: 'Você não pode alterar seu próprio perfil de acesso' }, 400);
  }

  const { data: target, error: targetError } =
    await admin.auth.admin.getUserById(user_id);
  if (targetError || !target?.user) {
    return json({ error: 'Usuário não encontrado no Auth' }, 404);
  }

  const normalizedName = full_name?.trim() || null;
  if (role && role !== 'admin' && isAdminUser(target.user)) {
    const users = await listAllUsers(admin);
    const adminCount = users.filter((user) => isAdminUser(user)).length;
    if (adminCount <= 1) {
      return json({ error: 'Não é possível remover o último administrador' }, 400);
    }
  }

  const updateInput: {
    user_metadata: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  } = {
    user_metadata: mergeAppMetadata(target.user.user_metadata, {
      full_name: normalizedName,
      name: normalizedName,
    }),
  };
  if (role) {
    updateInput.app_metadata = mergeAppMetadata(target.user.app_metadata, {
      role,
      is_admin: role === 'admin',
    });
  }

  const { data, error } = await admin.auth.admin.updateUserById(user_id, updateInput);
  if (error) return json({ error: error.message }, 500);

  if (data.user.email) {
    try {
      await withDatabase(env, (db) =>
        db
          .insert(profiles)
          .values({ id: data.user.id, email: data.user.email!.toLowerCase(), fullName: normalizedName })
          .onConflictDoUpdate({
            target: profiles.id,
            set: { email: data.user.email!.toLowerCase(), fullName: normalizedName },
          }),
      );
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Erro ao atualizar perfil' }, 500);
    }
  }

  return json(
    {
      ok: true,
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

function parseOptionalUserRole(
  value: unknown,
): Exclude<UserRole, null> | 'invalid' | null {
  if (value === undefined) return null;
  if (value === 'admin' || value === 'vendedor') return value;
  return 'invalid';
}
