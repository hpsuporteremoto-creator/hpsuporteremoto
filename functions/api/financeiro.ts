import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, pixRecebedorConfig, transacoes } from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { listAtendimentosComRelacoes } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { isoDateSchema, positiveIntegerSchema, readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };

const financialMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), id: uuidSchema }),
  z.object({
    action: z.literal('save-pix'),
    pix_key: z.string().trim().min(1, 'Preencha os dados do recebedor PIX').max(512),
    receiver_name: z.string().trim().min(2, 'Preencha os dados do recebedor PIX').max(120),
    receiver_city: z.string().trim().min(2, 'Preencha os dados do recebedor PIX').max(80),
  }),
  z.object({
    action: z.literal('create'),
    tipo: z.enum(['entrada', 'saida']),
    valor_centavos: positiveIntegerSchema,
    descricao: z.string().trim().min(2, 'Dados da transação inválidos').max(1_000),
    data: isoDateSchema,
    atendimento_id: uuidSchema.nullable().optional().transform((value) => value ?? null),
  }),
]);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'list';
  try {
    if (action === 'pix') {
      const config = await withDatabase(env, async (db) => {
        const [row] = await db.select().from(pixRecebedorConfig).where(eq(pixRecebedorConfig.id, 1));
        return row ? toPixConfig(row) : null;
      });
      return json({ config });
    }
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    if (!isDate(from) || !isDate(to)) return json({ error: 'Período inválido' }, 400);
    const transacoesList = await withDatabase(env, async (db) => {
      const rows = await db
        .select()
        .from(transacoes)
        .where(and(gte(transacoes.data, from), lte(transacoes.data, to)))
        .orderBy(desc(transacoes.data), desc(transacoes.createdAt));
      const atendimentoIds = rows.flatMap((row) => (row.atendimentoId ? [row.atendimentoId] : []));
      const atendimentoRows = atendimentoIds.length
        ? await listAtendimentosComRelacoes(db, inArray(atendimentos.id, atendimentoIds))
        : [];
      const byId = new Map(atendimentoRows.map((atendimento) => [atendimento.id, atendimento]));
      return rows.map((row) => ({
        id: row.id,
        tipo: row.tipo,
        valor_centavos: row.valorCentavos,
        descricao: row.descricao,
        atendimento_id: row.atendimentoId,
        data: row.data,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        atendimento: row.atendimentoId ? (byId.get(row.atendimentoId) ?? null) : null,
      }));
    });
    return json({ transacoes: transacoesList });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar financeiro' }, 500);
  }
};

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);
  const parsed = await readJson(request, financialMutationSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.data;
  try {
    if (body.action === 'delete') {
      await withDatabase(env, (db) => db.delete(transacoes).where(eq(transacoes.id, body.id)));
      return json({ ok: true });
    }
    if (body.action === 'save-pix') {
      const { pix_key: pixKey, receiver_name: receiverName, receiver_city: receiverCity } = body;
      const config = await withDatabase(env, async (db) => {
        const [row] = await db
          .insert(pixRecebedorConfig)
          .values({ id: 1, pixKey, receiverName, receiverCity })
          .onConflictDoUpdate({ target: pixRecebedorConfig.id, set: { pixKey, receiverName, receiverCity } })
          .returning();
        return row ? toPixConfig(row) : null;
      });
      return json({ config });
    }
    if (body.action === 'create') {
      const { tipo, valor_centavos: valorCentavos, descricao, data, atendimento_id: atendimentoId } = body;
      const transacao = await withDatabase(env, async (db) => {
        const [row] = await db.insert(transacoes).values({ tipo, valorCentavos, descricao, data, atendimentoId }).returning();
        return row ? toTransacao(row) : null;
      });
      return json({ transacao }, 201);
    }
    return json({ error: 'Ação inválida' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao salvar financeiro' }, 500);
  }
};

function toTransacao(row: typeof transacoes.$inferSelect) {
  return { id: row.id, tipo: row.tipo, valor_centavos: row.valorCentavos, descricao: row.descricao, atendimento_id: row.atendimentoId, data: row.data, created_at: row.createdAt, updated_at: row.updatedAt };
}

function toPixConfig(row: typeof pixRecebedorConfig.$inferSelect) {
  return { id: row.id, pix_key: row.pixKey, receiver_name: row.receiverName, receiver_city: row.receiverCity, created_at: row.createdAt, updated_at: row.updatedAt };
}

function isDate(value: string): boolean {
  return isoDateSchema.safeParse(value).success;
}
