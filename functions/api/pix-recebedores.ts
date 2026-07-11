import { asc, desc, eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { pixRecebedores } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  try {
    const recebedores = await withDatabase(env, (db) =>
      db
        .select()
        .from(pixRecebedores)
        .where(eq(pixRecebedores.ativo, true))
        .orderBy(desc(pixRecebedores.padrao), asc(pixRecebedores.receiverName)),
    );
    return json({ recebedores: recebedores.map(toPixRecebedor) }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar chaves PIX' }, 500);
  }
};

function toPixRecebedor(row: typeof pixRecebedores.$inferSelect) {
  return {
    id: row.id,
    pix_key: row.pixKey,
    receiver_name: row.receiverName,
    receiver_city: row.receiverCity,
    ativo: row.ativo,
    padrao: row.padrao,
  };
}
