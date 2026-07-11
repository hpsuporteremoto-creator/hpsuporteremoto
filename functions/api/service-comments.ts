import { asc, eq } from 'drizzle-orm';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { servicoComentarios, servicos } from '../../drizzle/schema';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const serviceCommentSchema = z.object({
  servico_id: uuidSchema,
  parent_id: uuidSchema.nullable().optional().transform((value) => value ?? null),
  texto: z.string().trim().min(2, 'Comentário muito curto').max(1_200),
});

type CommentRow = {
  id: string;
  servico_id: string;
  parent_id: string | null;
  user_id: string;
  author_name: string;
  author_email: string | null;
  author_avatar_url: string | null;
  texto: string;
  created_at: string;
  updated_at: string;
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const serviceId = new URL(request.url).searchParams.get('servicoId')?.trim();
  if (!serviceId) return json({ error: 'servicoId obrigatório' }, 400);
  try {
    const comentarios = await withDatabase(env, async (db) => {
      const rows = await db
        .select()
        .from(servicoComentarios)
        .where(eq(servicoComentarios.servicoId, serviceId))
        .orderBy(asc(servicoComentarios.createdAt));
      return rows.map(toCommentRow);
    });
    return json({ comentarios, configured: true }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar comentários' }, 500);
  }
};

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const admin = createAdmin(env);
  if (!admin) return json({ error: 'Servidor mal configurado' }, 500);
  const userResult = await getUser(admin, request);
  if (!userResult.ok) return json({ error: userResult.error }, userResult.status);
  const parsed = await readJson(request, serviceCommentSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { servico_id: servicoId, parent_id: parentId, texto } = parsed.data;
  try {
    const comentario = await withDatabase(env, async (db) => {
      const [servico] = await db
        .select({ id: servicos.id, ativo: servicos.ativo, vitrine: servicos.vitrine })
        .from(servicos)
        .where(eq(servicos.id, servicoId));
      if (!servico || !servico.ativo || !servico.vitrine) return null;
      const [created] = await db
        .insert(servicoComentarios)
        .values({
          servicoId,
          parentId,
          userId: userResult.user.id,
          authorName: resolveAuthorName(userResult.user),
          authorEmail: userResult.user.email ?? null,
          authorAvatarUrl: metadataText(userResult.user.user_metadata, 'avatar_url'),
          texto,
        })
        .returning();
      return created ? toCommentRow(created) : null;
    });
    if (!comentario) return json({ error: 'Serviço indisponível para comentários' }, 404);
    return json({ comentario }, 201);
  } catch (error) {
    const candidate = error as { code?: string; message?: string };
    if (candidate.code === '23514') return json({ error: 'Comentário deve ter entre 2 e 1200 caracteres.' }, 400);
    if (candidate.code === '23503') return json({ error: 'Comentário ou serviço não encontrado.' }, 400);
    return json({ error: candidate.message ?? 'Erro ao salvar comentário' }, 400);
  }
};

function createAdmin(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getUser(
  admin: SupabaseClient,
  request: Request,
): Promise<{ ok: true; user: User } | { ok: false; status: number; error: string }> {
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return { ok: false, status: 401, error: 'Entre com Google para comentar.' };
  const token = authHeader.slice('bearer '.length).trim();
  const { data: { user }, error } = await admin.auth.getUser(token);
  return error || !user ? { ok: false, status: 401, error: 'Sessão inválida' } : { ok: true, user };
}

function resolveAuthorName(user: User): string {
  return metadataText(user.user_metadata, 'full_name') ?? metadataText(user.user_metadata, 'name') ?? user.email ?? 'Cliente';
}

function metadataText(metadata: unknown, key: string): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function toCommentRow(comment: typeof servicoComentarios.$inferSelect): CommentRow {
  return {
    id: comment.id,
    servico_id: comment.servicoId,
    parent_id: comment.parentId,
    user_id: comment.userId,
    author_name: comment.authorName,
    author_email: comment.authorEmail,
    author_avatar_url: comment.authorAvatarUrl,
    texto: comment.texto,
    created_at: comment.createdAt,
    updated_at: comment.updatedAt,
  };
}
