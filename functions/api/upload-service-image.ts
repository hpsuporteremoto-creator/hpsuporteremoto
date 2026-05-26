import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const BUCKET = 'service-images';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'FormData inválido' }, 400);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) return json({ error: 'Arquivo obrigatório' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) {
    return json({ error: 'Envie uma imagem JPG, PNG, WebP ou GIF.' }, 400);
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return json({ error: 'A imagem deve ter até 5 MB.' }, 400);
  }

  const bucketReady = await ensureBucket(admin);
  if ('error' in bucketReady) return json({ error: bucketReady.error }, 500);

  const extension = extensionFromFile(file);
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    });

  if (error) return json({ error: error.message }, 500);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return json({ url: data.publicUrl, path }, 201);
};

async function ensureBucket(admin: SupabaseClient): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await admin.storage.getBucket(BUCKET);
  if (!error && data) return { ok: true };

  const created = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  if (created.error) return { error: created.error.message };
  return { ok: true };
}

function extensionFromFile(file: File): string {
  switch (file.type) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'jpg';
  }
}
