import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { clientes, profiles } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { toClienteResponse } from '../lib/clientes';

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

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
  if (!id) return json({ error: 'id obrigatório' }, 400);

  try {
    const cliente = await withDatabase(env, async (db) => {
      const [row] = await db
        .select({
          cliente: clientes,
          cadastradoPor: {
            id: profiles.id,
            email: profiles.email,
            full_name: profiles.fullName,
          },
        })
        .from(clientes)
        .leftJoin(profiles, eq(clientes.cadastradoPorUserId, profiles.id))
        .where(eq(clientes.id, id));
      if (!row) return null;
      return toClienteResponse(row.cliente, row.cadastradoPor?.id ? row.cadastradoPor : null);
    });
    if (!cliente) return json({ error: 'Cliente não encontrado' }, 404);
    return json({ cliente }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar cliente' }, 500);
  }
};
