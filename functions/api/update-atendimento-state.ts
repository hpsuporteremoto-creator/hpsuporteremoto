import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento, type AtendimentoState } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };

const ALLOWED_STATES = new Set<AtendimentoState>([
  'aguardando_confirmacao',
  'recusado',
  'em_andamento',
  'pagamento',
  'concluido',
]);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);
  let body: { id?: unknown; state?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; state?: unknown };
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }
  if (typeof body.id !== 'string' || !body.id) return json({ error: 'id obrigatório' }, 400);
  if (typeof body.state !== 'string' || !ALLOWED_STATES.has(body.state as AtendimentoState)) {
    return json({ error: 'state inválido' }, 400);
  }
  if (body.state === 'recusado' && staffCheck.role !== 'admin') {
    return json({ error: 'Apenas administradores podem cancelar atendimentos' }, 403);
  }

  try {
    const result = await withDatabase(env, async (db) => {
      const [atendimento] = await db
        .select({
          id: atendimentos.id,
          criado_por_user_id: atendimentos.criadoPorUserId,
          vendido_por_user_id: atendimentos.vendidoPorUserId,
          atendido_por_user_id: atendimentos.atendidoPorUserId,
        })
        .from(atendimentos)
        .where(eq(atendimentos.id, body.id as string));
      if (!atendimento) return 'not-found' as const;
      if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) {
        return 'forbidden' as const;
      }
      await db
        .update(atendimentos)
        .set({
          state: body.state as typeof atendimentos.$inferSelect.state,
          ...(body.state === 'em_andamento' ? { atendidoPorUserId: staffCheck.user.id } : {}),
        })
        .where(eq(atendimentos.id, body.id as string));
      return 'ok' as const;
    });
    if (result === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
    if (result === 'forbidden') return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
    return json({ ok: true }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao atualizar atendimento' }, 500);
  }
};
