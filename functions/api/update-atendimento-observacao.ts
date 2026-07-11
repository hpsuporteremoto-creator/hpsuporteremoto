import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };
const atendimentoObservacaoSchema = z.object({
  id: uuidSchema,
  descricao_solicitacao: z.string().trim().max(20_000).nullable().optional().transform((value) => value || null),
});

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
  const parsed = await readJson(request, atendimentoObservacaoSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { id, descricao_solicitacao: descricao } = parsed.data;
  try {
    const result = await withDatabase(env, async (db) => {
      const [atendimento] = await db
        .select({
          state: atendimentos.state,
          criado_por_user_id: atendimentos.criadoPorUserId,
          vendido_por_user_id: atendimentos.vendidoPorUserId,
          atendido_por_user_id: atendimentos.atendidoPorUserId,
        })
        .from(atendimentos)
        .where(eq(atendimentos.id, id));
      if (!atendimento) return 'not-found' as const;
      if (!canStaffAccessAtendimento(atendimento, staffCheck.role, staffCheck.user.id)) return 'forbidden' as const;
      if (atendimento.state !== 'pagamento') return 'locked' as const;
      await db
        .update(atendimentos)
        .set({ descricaoSolicitacao: descricao })
        .where(eq(atendimentos.id, id));
      return 'ok' as const;
    });
    if (result === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
    if (result === 'forbidden') return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
    if (result === 'locked') return json({ error: 'Observação só pode ser editada em pagamento' }, 409);
    return json({ ok: true }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao salvar observação' }, 500);
  }
};
