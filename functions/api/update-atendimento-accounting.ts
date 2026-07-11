import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, transacoes } from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  let body: { id?: unknown; contabilizar?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; contabilizar?: unknown };
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }
  const atendimentoId = isUuidString(body.id) ? body.id : null;
  if (!atendimentoId) return json({ error: 'id inválido' }, 400);
  if (typeof body.contabilizar !== 'boolean') return json({ error: 'contabilizar deve ser booleano' }, 400);
  try {
    const result = await withDatabase(env, async (db) => {
      const [atendimento] = await db
        .select({ state: atendimentos.state, valorCentavos: atendimentos.valorCentavos })
        .from(atendimentos)
        .where(eq(atendimentos.id, atendimentoId));
      if (!atendimento) return 'not-found' as const;
      if (atendimento.state !== 'concluido') return 'locked' as const;
      const [transacao] = await db
        .select({ id: transacoes.id })
        .from(transacoes)
        .where(eq(transacoes.atendimentoId, atendimentoId));
      if (transacao) {
        if (!body.contabilizar) await db.delete(transacoes).where(eq(transacoes.id, transacao.id));
        return 'ok' as const;
      }
      if (!body.contabilizar) return 'ok' as const;
      if (!atendimento.valorCentavos || atendimento.valorCentavos <= 0) return 'invalid-value' as const;
      await db.insert(transacoes).values({
        tipo: 'entrada',
        valorCentavos: atendimento.valorCentavos,
        descricao: `Atendimento #${atendimentoId.slice(0, 8)}`,
        atendimentoId,
      });
      return 'ok' as const;
    });
    if (result === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
    if (result === 'locked') return json({ error: 'Somente pedidos finalizados podem ser desabilitados' }, 409);
    if (result === 'invalid-value') return json({ error: 'Atendimento não tem valor financeiro para reabilitar' }, 400);
    return json({ ok: true, contabilizar: body.contabilizar }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao atualizar financeiro' }, 500);
  }
};

function isUuidString(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}
