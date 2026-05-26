import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

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

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const url = new URL(request.url);
  const id = url.searchParams.get('id')?.trim() ?? '';
  if (!id) return json({ error: 'id obrigatório' }, 400);

  let query = admin.from('clientes').select('*').eq('id', id);
  if (staffCheck.role !== 'admin') {
    query = query.eq('ativo', true);
  }

  const { data, error } = await query.maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'Cliente não encontrado' }, 404);

  return json({ cliente: data }, 200);
};
