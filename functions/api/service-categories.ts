import { asc, desc, eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { servicoCategorias } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
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

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id')?.trim();
    const apenasAtivas = url.searchParams.get('ativas') === 'true';
    const payload = await withDatabase(env, async (db) => {
      if (id) {
        const [categoria] = await db
          .select()
          .from(servicoCategorias)
          .where(eq(servicoCategorias.id, id));
        return { categoria: categoria ?? null };
      }
      const query = db.select().from(servicoCategorias);
      const categorias = apenasAtivas
        ? await query.where(eq(servicoCategorias.ativo, true)).orderBy(asc(servicoCategorias.nome))
        : await query.orderBy(desc(servicoCategorias.ativo), asc(servicoCategorias.nome));
      return { categorias };
    });
    return json(payload, 200);
  } catch (error) {
    return json({ error: databaseErrorMessage(error) }, 500);
  }
};

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const action = body['action'];
  const id = typeof body['id'] === 'string' ? body['id'] : null;
  if ((action === 'update' || action === 'toggle' || action === 'delete') && !id) {
    return json({ error: 'id obrigatório' }, 400);
  }

  try {
    if (action === 'delete') {
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await withDatabase(env, (db) =>
        db.delete(servicoCategorias).where(eq(servicoCategorias.id, id)),
      );
      return json({ ok: true }, 200);
    }

    if (action === 'toggle') {
      if (!id) return json({ error: 'id obrigatório' }, 400);
      await withDatabase(env, (db) =>
        db
          .update(servicoCategorias)
          .set({ ativo: body['ativo'] === true })
          .where(eq(servicoCategorias.id, id)),
      );
      return json({ ok: true }, 200);
    }

    const input = buildInput(body);
    if ('error' in input) return json({ error: input.error }, 400);

    const categoria = await withDatabase(env, async (db) => {
      if (action === 'update') {
        if (!id) return null;
        const [updated] = await db
          .update(servicoCategorias)
          .set(input)
          .where(eq(servicoCategorias.id, id))
          .returning();
        return updated ?? null;
      }
      const [created] = await db.insert(servicoCategorias).values(input).returning();
      return created ?? null;
    });
    if (!categoria) return json({ error: 'Categoria não encontrada' }, 404);
    return json({ categoria }, action === 'update' ? 200 : 201);
  } catch (error) {
    return json({ error: databaseErrorMessage(error) }, 400);
  }
};

function buildInput(body: Record<string, unknown>) {
  const nome = typeof body['nome'] === 'string' ? body['nome'].trim() : '';
  if (nome.length < 2) return { error: 'Nome obrigatório' };
  return {
    nome,
    descricao: normalizeOptionalText(body['descricao']),
    ativo: body['ativo'] !== false,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function databaseErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') return 'Já existe uma categoria com este nome.';
  if (candidate.code === '23503') return 'Esta categoria está em uso por serviços cadastrados.';
  return typeof candidate.message === 'string' ? candidate.message : 'Erro ao salvar categoria';
}
