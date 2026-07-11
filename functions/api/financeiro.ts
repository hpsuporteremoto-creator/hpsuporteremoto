import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, pixRecebedorConfig, transacoes } from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { listAtendimentosComRelacoes } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };

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
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; } catch { return json({ error: 'Corpo JSON inválido' }, 400); }
  const action = body['action'];
  try {
    if (action === 'delete') {
      const id = typeof body['id'] === 'string' ? body['id'] : '';
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await withDatabase(env, (db) => db.delete(transacoes).where(eq(transacoes.id, id)));
      return json({ ok: true });
    }
    if (action === 'save-pix') {
      const pixKey = normalizeText(body['pix_key']);
      const receiverName = normalizeText(body['receiver_name']);
      const receiverCity = normalizeText(body['receiver_city']);
      if (!pixKey || !receiverName || !receiverCity) return json({ error: 'Preencha os dados do recebedor PIX' }, 400);
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
    if (action === 'create') {
      const tipo = body['tipo'];
      const valorCentavos = body['valor_centavos'];
      const descricao = normalizeText(body['descricao']);
      const data = typeof body['data'] === 'string' ? body['data'] : '';
      const atendimentoId = typeof body['atendimento_id'] === 'string' ? body['atendimento_id'] : null;
      if ((tipo !== 'entrada' && tipo !== 'saida') || !Number.isInteger(valorCentavos) || (valorCentavos as number) <= 0 || !descricao || !isDate(data)) {
        return json({ error: 'Dados da transação inválidos' }, 400);
      }
      const transacao = await withDatabase(env, async (db) => {
        const [row] = await db.insert(transacoes).values({ tipo, valorCentavos: valorCentavos as number, descricao, data, atendimentoId }).returning();
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

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
