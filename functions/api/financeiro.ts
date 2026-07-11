import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, pixRecebedores, transacoes } from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { listAtendimentosComRelacoes } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { isoDateSchema, positiveIntegerSchema, readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };

const pixReceiverDataSchema = z.object({
  pix_key: z.string().trim().min(1, 'Preencha os dados da chave PIX').max(512),
  receiver_name: z.string().trim().min(2, 'Preencha o nome do recebedor').max(120),
  receiver_city: z.string().trim().min(2, 'Preencha a cidade do recebedor').max(80),
});

const financialMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('delete'), id: uuidSchema }),
  z.object({ action: z.literal('save-pix'), ...pixReceiverDataSchema.shape }),
  z.object({ action: z.literal('create-pix'), ...pixReceiverDataSchema.shape }),
  z.object({ action: z.literal('update-pix'), id: uuidSchema, ...pixReceiverDataSchema.shape }),
  z.object({ action: z.literal('toggle-pix'), id: uuidSchema, ativo: z.boolean() }),
  z.object({ action: z.literal('set-default-pix'), id: uuidSchema }),
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
      const recebedores = await withDatabase(env, (db) =>
        db
          .select()
          .from(pixRecebedores)
          .orderBy(desc(pixRecebedores.ativo), desc(pixRecebedores.padrao), asc(pixRecebedores.receiverName)),
      );
      const list = recebedores.map(toPixRecebedor);
      return json({ recebedores: list, config: list.find((item) => item.padrao) ?? list[0] ?? null });
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
    if (body.action === 'save-pix' || body.action === 'create-pix') {
      const { pix_key: pixKey, receiver_name: receiverName, receiver_city: receiverCity } = body;
      const recebedor = await withDatabase(env, async (db) => {
        if (body.action === 'save-pix') {
          const [existing] = await db
            .select()
            .from(pixRecebedores)
            .where(and(eq(pixRecebedores.ativo, true), eq(pixRecebedores.padrao, true)));
          if (existing) {
            const [updated] = await db
              .update(pixRecebedores)
              .set({ pixKey, receiverName, receiverCity })
              .where(eq(pixRecebedores.id, existing.id))
              .returning();
            return updated ?? null;
          }
        }
        const [activeDefault] = await db
          .select({ id: pixRecebedores.id })
          .from(pixRecebedores)
          .where(and(eq(pixRecebedores.ativo, true), eq(pixRecebedores.padrao, true)));
        const [created] = await db
          .insert(pixRecebedores)
          .values({ pixKey, receiverName, receiverCity, ativo: true, padrao: !activeDefault })
          .returning();
        return created ?? null;
      });
      if (!recebedor) return json({ error: 'Falha ao salvar chave PIX' }, 500);
      return json({ recebedor: toPixRecebedor(recebedor), config: toPixRecebedor(recebedor) }, body.action === 'create-pix' ? 201 : 200);
    }
    if (body.action === 'update-pix') {
      const { id, pix_key: pixKey, receiver_name: receiverName, receiver_city: receiverCity } = body;
      const recebedor = await withDatabase(env, async (db) => {
        const [updated] = await db
          .update(pixRecebedores)
          .set({ pixKey, receiverName, receiverCity })
          .where(eq(pixRecebedores.id, id))
          .returning();
        return updated ?? null;
      });
      if (!recebedor) return json({ error: 'Chave PIX não encontrada' }, 404);
      return json({ recebedor: toPixRecebedor(recebedor) });
    }
    if (body.action === 'toggle-pix') {
      const result = await withDatabase(env, async (db) => {
        const [current] = await db.select().from(pixRecebedores).where(eq(pixRecebedores.id, body.id));
        if (!current) return 'not-found' as const;
        if (current.padrao && !body.ativo) return 'default' as const;
        await db.update(pixRecebedores).set({ ativo: body.ativo }).where(eq(pixRecebedores.id, body.id));
        return 'ok' as const;
      });
      if (result === 'not-found') return json({ error: 'Chave PIX não encontrada' }, 404);
      if (result === 'default') return json({ error: 'Defina outra chave padrão antes de desativar esta.' }, 409);
      return json({ ok: true });
    }
    if (body.action === 'set-default-pix') {
      const result = await withDatabase(env, async (db) => {
        const [current] = await db.select().from(pixRecebedores).where(eq(pixRecebedores.id, body.id));
        if (!current || !current.ativo) return false;
        await db.update(pixRecebedores).set({ padrao: false }).where(eq(pixRecebedores.padrao, true));
        await db.update(pixRecebedores).set({ padrao: true }).where(eq(pixRecebedores.id, body.id));
        return true;
      });
      if (!result) return json({ error: 'Chave PIX ativa não encontrada' }, 404);
      return json({ ok: true });
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

function toPixRecebedor(row: typeof pixRecebedores.$inferSelect) {
  return {
    id: row.id,
    pix_key: row.pixKey,
    receiver_name: row.receiverName,
    receiver_city: row.receiverCity,
    ativo: row.ativo,
    padrao: row.padrao,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function isDate(value: string): boolean {
  return isoDateSchema.safeParse(value).success;
}
