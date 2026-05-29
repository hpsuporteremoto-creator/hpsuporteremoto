import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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

type ClienteRow = {
  id: string;
  cadastrado_por_user_id: string | null;
  cadastrado_por?: UserRef | null;
};

type UserRef = {
  id: string;
  email: string;
  full_name: string | null;
};

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

  const { data, error } = await admin.from('clientes').select('*').eq('id', id).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: 'Cliente não encontrado' }, 404);

  const cliente = await hydrateClienteUser(admin, data as ClienteRow);
  return json({ cliente }, 200);
};

async function hydrateClienteUser(admin: SupabaseClient, cliente: ClienteRow): Promise<ClienteRow> {
  if (!cliente.cadastrado_por_user_id) return { ...cliente, cadastrado_por: null };

  const { data, error } = await admin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', cliente.cadastrado_por_user_id)
    .maybeSingle<UserRef>();
  if (error) throw new Error(error.message);
  return { ...cliente, cadastrado_por: data ?? null };
}
