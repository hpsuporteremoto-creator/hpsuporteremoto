import { asc, desc, eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { servicoCategorias } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const categoriaDataSchema = z.object({
  nome: z.string().trim().min(2, 'Nome deve ter ao menos 2 caracteres'),
  descricao: z.string().trim().max(5_000).nullable().optional().transform((value) => value || null),
  ativo: z.boolean().optional().default(true),
});

const categoriaMutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), ...categoriaDataSchema.shape }),
  z.object({ action: z.literal('update'), id: uuidSchema, ...categoriaDataSchema.shape }),
  z.object({ action: z.literal('toggle'), id: uuidSchema, ativo: z.boolean() }),
  z.object({ action: z.literal('delete'), id: uuidSchema }),
]);

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

  const parsed = await readJson(request, categoriaMutationSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.data;

  try {
    if (body.action === 'delete') {
      await withDatabase(env, (db) =>
        db.delete(servicoCategorias).where(eq(servicoCategorias.id, body.id)),
      );
      return json({ ok: true }, 200);
    }

    if (body.action === 'toggle') {
      await withDatabase(env, (db) =>
        db
          .update(servicoCategorias)
          .set({ ativo: body.ativo })
          .where(eq(servicoCategorias.id, body.id)),
      );
      return json({ ok: true }, 200);
    }

    const input = categoriaDataSchema.parse(body);

    const categoria = await withDatabase(env, async (db) => {
      if (body.action === 'update') {
        const [updated] = await db
          .update(servicoCategorias)
          .set(input)
          .where(eq(servicoCategorias.id, body.id))
          .returning();
        return updated ?? null;
      }
      const [created] = await db.insert(servicoCategorias).values(input).returning();
      return created ?? null;
    });
    if (!categoria) return json({ error: 'Categoria não encontrada' }, 404);
    return json({ categoria }, body.action === 'update' ? 200 : 201);
  } catch (error) {
    return json({ error: databaseErrorMessage(error) }, 400);
  }
};

function databaseErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') return 'Já existe uma categoria com este nome.';
  if (candidate.code === '23503') return 'Esta categoria está em uso por serviços cadastrados.';
  return typeof candidate.message === 'string' ? candidate.message : 'Erro ao salvar categoria';
}
