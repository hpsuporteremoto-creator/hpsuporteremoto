import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, transacoes } from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };
const DELETABLE_STATES = new Set(['aguardando_confirmacao', 'em_andamento']);
const deleteAtendimentoSchema = z.object({ id: uuidSchema });

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);
  const parsed = await readJson(request, deleteAtendimentoSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const atendimentoId = parsed.data.id;
  try {
    const result = await withDatabase(env, async (db) => {
      const [atendimento] = await db
        .select({ state: atendimentos.state })
        .from(atendimentos)
        .where(eq(atendimentos.id, atendimentoId));
      if (!atendimento) return 'not-found' as const;
      if (!DELETABLE_STATES.has(atendimento.state)) return 'locked' as const;
      await db.delete(transacoes).where(eq(transacoes.atendimentoId, atendimentoId));
      await db.delete(atendimentos).where(eq(atendimentos.id, atendimentoId));
      return 'ok' as const;
    });
    if (result === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
    if (result === 'locked') return json({ error: 'Somente pedidos em andamento podem ser excluídos' }, 409);
    return json({ ok: true }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao excluir atendimento' }, 500);
  }
};
