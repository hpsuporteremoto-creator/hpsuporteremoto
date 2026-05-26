import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

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

const COMMENTS_BUCKET = 'service-comments';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const admin = createAdmin(env);
  if (!admin) return json({ error: 'Servidor mal configurado' }, 500);

  const serviceId = new URL(request.url).searchParams.get('servicoId');
  if (!serviceId) return json({ error: 'servicoId obrigatório' }, 400);

  const { data, error } = await admin
    .from('servico_comentarios')
    .select('*')
    .eq('servico_id', serviceId)
    .order('created_at', { ascending: true });
  if (error && isMissingCommentsTable(error)) {
    return json({ comentarios: await readStoredComments(admin, serviceId), configured: true }, 200);
  }
  if (error) return json({ error: error.message }, 500);
  return json({ comentarios: data ?? [], configured: true }, 200);
};

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const admin = createAdmin(env);
  if (!admin) return json({ error: 'Servidor mal configurado' }, 500);

  const userResult = await getUser(admin, request);
  if (!userResult.ok) return json({ error: userResult.error }, userResult.status);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const servicoId = typeof body['servico_id'] === 'string' ? body['servico_id'] : '';
  const parentId = typeof body['parent_id'] === 'string' ? body['parent_id'] : null;
  const texto = typeof body['texto'] === 'string' ? body['texto'].trim() : '';
  if (!servicoId) return json({ error: 'Serviço obrigatório' }, 400);
  if (texto.length < 2 || texto.length > 1200) {
    return json({ error: 'Comentário deve ter entre 2 e 1200 caracteres.' }, 400);
  }

  const serviceCheck = await isPublicService(admin, servicoId);
  if ('error' in serviceCheck) return json({ error: serviceCheck.error }, 500);
  if (!serviceCheck.ok) return json({ error: 'Serviço indisponível para comentários' }, 404);

  const user = userResult.user;
  const input = {
    servico_id: servicoId,
    parent_id: parentId,
    user_id: user.id,
    author_name: resolveAuthorName(user),
    author_email: user.email ?? null,
    author_avatar_url: metadataText(user.user_metadata, 'avatar_url'),
    texto,
  };

  const { data, error } = await admin
    .from('servico_comentarios')
    .insert(input)
    .select('*')
    .single();
  if (error && isMissingCommentsTable(error)) {
    try {
      const comentario = await appendStoredComment(admin, input);
      return json({ comentario }, 201);
    } catch (storageError) {
      return json(
        {
          error:
            storageError instanceof Error
              ? storageError.message
              : 'Erro ao salvar comentário',
        },
        400,
      );
    }
  }
  if (error) return json({ error: toCommentError(error) }, 400);
  return json({ comentario: data as CommentRow }, 201);
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
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Entre com Google para comentar.' };
  }
  const token = authHeader.slice('bearer '.length).trim();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(token);
  if (error || !user) return { ok: false, status: 401, error: 'Sessão inválida' };
  return { ok: true, user };
}

async function isPublicService(
  admin: SupabaseClient,
  id: string,
): Promise<{ ok: boolean } | { error: string }> {
  const result = await admin
    .from('servicos')
    .select('id, ativo, vitrine')
    .eq('id', id)
    .maybeSingle();
  if (!result.error) {
    return { ok: result.data?.ativo === true && result.data?.vitrine === true };
  }
  if (!isMissingVitrineColumn(result.error)) return { error: result.error.message };

  const legacyResult = await admin
    .from('servicos')
    .select('id, ativo')
    .eq('id', id)
    .maybeSingle();
  if (legacyResult.error) return { error: legacyResult.error.message };
  return { ok: legacyResult.data?.ativo === true };
}

function resolveAuthorName(user: User): string {
  return (
    metadataText(user.user_metadata, 'full_name') ??
    metadataText(user.user_metadata, 'name') ??
    user.email ??
    'Cliente'
  );
}

function metadataText(metadata: unknown, key: string): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isMissingVitrineColumn(error: { code?: string; message: string }): boolean {
  return error.code === '42703' || error.message.includes('servicos.vitrine');
}

function isMissingCommentsTable(error: { code?: string; message: string }): boolean {
  return (
    error.code === '42P01' ||
    error.message.includes('servico_comentarios')
  );
}

function toCommentError(error: { code?: string; message: string }): string {
  if (error.code === '23514') return 'Comentário deve ter entre 2 e 1200 caracteres.';
  if (error.code === '23503') return 'Comentário ou serviço não encontrado.';
  if (error.message.includes('Respostas só podem ter um nível')) {
    return 'Respostas só podem ter um nível.';
  }
  return error.message;
}

async function readStoredComments(
  admin: SupabaseClient,
  servicoId: string,
): Promise<CommentRow[]> {
  const { data, error } = await admin.storage
    .from(COMMENTS_BUCKET)
    .download(`${servicoId}.json`);
  if (error || !data) return [];
  try {
    const parsed = JSON.parse(await data.text()) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCommentRow);
  } catch {
    return [];
  }
}

async function appendStoredComment(
  admin: SupabaseClient,
  input: Omit<CommentRow, 'id' | 'created_at' | 'updated_at'>,
): Promise<CommentRow> {
  await ensureCommentsBucket(admin);
  const comments = await readStoredComments(admin, input.servico_id);
  if (input.parent_id) {
    const parent = comments.find((comment) => comment.id === input.parent_id);
    if (!parent || parent.parent_id !== null) {
      throw new Error('Comentário pai inválido.');
    }
  }
  const now = new Date().toISOString();
  const comentario: CommentRow = {
    ...input,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  };
  const next = [...comments, comentario];
  const { error } = await admin.storage.from(COMMENTS_BUCKET).upload(
    `${input.servico_id}.json`,
    new Blob([JSON.stringify(next)], { type: 'application/json' }),
    { contentType: 'application/json', upsert: true },
  );
  if (error) throw new Error(error.message);
  return comentario;
}

async function ensureCommentsBucket(admin: SupabaseClient): Promise<void> {
  const { data, error } = await admin.storage.getBucket(COMMENTS_BUCKET);
  if (!error && data) return;
  await admin.storage.createBucket(COMMENTS_BUCKET, { public: false });
}

function isCommentRow(value: unknown): value is CommentRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row['id'] === 'string' &&
    typeof row['servico_id'] === 'string' &&
    (typeof row['parent_id'] === 'string' || row['parent_id'] === null) &&
    typeof row['user_id'] === 'string' &&
    typeof row['author_name'] === 'string' &&
    typeof row['texto'] === 'string' &&
    typeof row['created_at'] === 'string' &&
    typeof row['updated_at'] === 'string'
  );
}
