import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento, listAtendimentosComRelacoes } from './atendimentos-shared';
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
    const [atendimento] = await withDatabase(env, (db) =>
      listAtendimentosComRelacoes(db, eq(atendimentos.id, id)),
    );
    if (!atendimento || !canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
      return json({ atendimento: null }, 200);
    }
    return json({ atendimento }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar atendimento' }, 500);
  }
};
