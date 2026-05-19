import type { Context } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

// Mantenha sincronizado com src/app/core/auth/admin-emails.ts
const ADMIN_EMAILS = [
  'heriveltonpiresalves@gmail.com',
  'hpsuporteremoto@gmail.com',
];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req: Request, _context: Context): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Authorization Bearer token ausente' }, 401);
  }
  const token = authHeader.slice('bearer '.length).trim();

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user: caller },
    error: callerError,
  } = await admin.auth.getUser(token);

  if (callerError || !caller?.email) {
    return json({ error: 'Token inválido' }, 401);
  }
  if (!ADMIN_EMAILS.includes(caller.email.toLowerCase())) {
    return json({ error: 'Acesso restrito a administradores' }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
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
  if (
    target.user.email &&
    ADMIN_EMAILS.includes(target.user.email.toLowerCase())
  ) {
    return json({ error: 'Não é possível apagar outro administrador' }, 400);
  }

  const { error: deleteErr } = await admin.auth.admin.deleteUser(user_id);
  if (deleteErr) {
    return json({ error: deleteErr.message }, 500);
  }

  return json({ ok: true }, 200);
};

export const config = { path: '/api/delete-user' };
