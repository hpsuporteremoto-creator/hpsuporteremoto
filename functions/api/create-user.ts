import { createClient } from '@supabase/supabase-js';
import { mergeAppMetadata, requireAdmin } from './admin-auth';
import type { UserRole } from './admin-auth';
import { emailSchema, readJson, z } from '../lib/validation';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const createUserSchema = z.object({
  email: emailSchema,
  role: z.enum(['admin', 'vendedor'], { message: 'Perfil de acesso obrigatório' }),
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

  const parsed = await readJson(request, createUserSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { email, role } = parsed.data;

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: mergeAppMetadata(null, {
      role,
      is_admin: role === 'admin',
    }),
  });

  if (createError) {
    return json({ error: translateCreateUserError(createError.message) }, 400);
  }

  return json(
    {
      user: {
        id: data.user.id,
        email: data.user.email,
        role,
        is_admin: role === 'admin',
      },
    },
    201,
  );
};

function translateCreateUserError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('email address') &&
    normalized.includes('already') &&
    normalized.includes('registered')
  ) {
    return 'Já existe um usuário cadastrado com este email.';
  }
  if (normalized.includes('user already registered')) {
    return 'Já existe um usuário cadastrado com este email.';
  }
  return message;
}
