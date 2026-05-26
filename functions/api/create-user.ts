import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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

  const rawEmail = (body as { email?: unknown })?.email;
  if (typeof rawEmail !== 'string') {
    return json({ error: 'Campo "email" obrigatório' }, 400);
  }
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    return json({ error: 'Email inválido' }, 400);
  }

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError) {
    return json({ error: translateCreateUserError(createError.message) }, 400);
  }

  return json({ user: { id: data.user.id, email: data.user.email } }, 201);
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
