import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { atendimentos } from '../../drizzle/schema';
import { requireStaff, type UserRole } from './admin-auth';
import { canStaffAccessAtendimento } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { uuidSchema } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const BUCKET = 'payment-receipts';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: 'Formulário inválido' }, 400);
  }
  const atendimentoIdResult = uuidSchema.safeParse(formData.get('atendimento_id'));
  if (!atendimentoIdResult.success) return json({ error: 'Atendimento inválido' }, 400);
  const atendimentoId = atendimentoIdResult.data;
  const file = formData.get('file');
  if (!(file instanceof File)) return json({ error: 'Comprovante obrigatório' }, 400);
  if (!ALLOWED_TYPES.has(file.type)) return json({ error: 'Envie um PDF, JPG, PNG ou WebP.' }, 400);
  if (file.size <= 0 || file.size > MAX_BYTES) return json({ error: 'O comprovante deve ter até 10 MB.' }, 400);

  const access = await findAccessiblePayment(env, atendimentoId, staffCheck.role, staffCheck.user.id);
  if (access === 'not-found') return json({ error: 'Atendimento não encontrado' }, 404);
  if (access === 'forbidden') return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
  if (access === 'locked') return json({ error: 'Anexe comprovantes enquanto o atendimento estiver em pagamento' }, 409);

  const bucketReady = await ensureBucket(admin);
  if ('error' in bucketReady) return json({ error: bucketReady.error }, 500);
  const path = `${atendimentoId}/${crypto.randomUUID()}.${extensionFromFile(file)}`;
  const { error } = await admin.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) return json({ error: error.message }, 500);

  return json(
    {
      comprovante: {
        path,
        nome: sanitizeFileName(file.name),
        tipo: file.type,
      },
    },
    201,
  );
};

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const atendimentoIdResult = uuidSchema.safeParse(
    new URL(request.url).searchParams.get('atendimento_id')?.trim() ?? '',
  );
  if (!atendimentoIdResult.success) return json({ error: 'Atendimento inválido' }, 400);
  const atendimentoId = atendimentoIdResult.data;

  const attendance = await withDatabase(env, async (db) => {
    const [row] = await db
      .select({
        comprovante_path: atendimentos.pagamentoComprovantePath,
        comprovante_nome: atendimentos.pagamentoComprovanteNome,
        comprovante_tipo: atendimentos.pagamentoComprovanteTipo,
        criado_por_user_id: atendimentos.criadoPorUserId,
        vendido_por_user_id: atendimentos.vendidoPorUserId,
        atendido_por_user_id: atendimentos.atendidoPorUserId,
      })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId));
    return row ?? null;
  });
  if (!attendance) return json({ error: 'Atendimento não encontrado' }, 404);
  if (!canStaffAccessAtendimento(attendance, staffCheck.role, staffCheck.user.id)) {
    return json({ error: 'Acesso restrito aos seus atendimentos' }, 403);
  }
  if (!attendance.comprovante_path) return json({ error: 'Nenhum comprovante anexado' }, 404);

  const signed = await admin.storage.from(BUCKET).createSignedUrl(attendance.comprovante_path, 600);
  if (signed.error || !signed.data?.signedUrl) {
    return json({ error: signed.error?.message ?? 'Não foi possível abrir o comprovante' }, 500);
  }
  return json(
    {
      url: signed.data.signedUrl,
      nome: attendance.comprovante_nome,
      tipo: attendance.comprovante_tipo,
    },
    200,
  );
};

async function findAccessiblePayment(
  env: Env,
  atendimentoId: string,
  role: UserRole,
  userId: string,
): Promise<'ok' | 'not-found' | 'forbidden' | 'locked'> {
  return withDatabase(env, async (db) => {
    const [attendance] = await db
      .select({
        state: atendimentos.state,
        criado_por_user_id: atendimentos.criadoPorUserId,
        vendido_por_user_id: atendimentos.vendidoPorUserId,
        atendido_por_user_id: atendimentos.atendidoPorUserId,
      })
      .from(atendimentos)
      .where(eq(atendimentos.id, atendimentoId));
    if (!attendance) return 'not-found' as const;
    if (!canStaffAccessAtendimento(attendance, role, userId)) return 'forbidden' as const;
    return attendance.state === 'pagamento' ? 'ok' : 'locked';
  });
}

async function ensureBucket(admin: SupabaseClient): Promise<{ ok: true } | { error: string }> {
  const { data, error } = await admin.storage.getBucket(BUCKET);
  if (!error && data) return { ok: true };
  const created = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...ALLOWED_TYPES],
  });
  return created.error ? { error: created.error.message } : { ok: true };
}

function extensionFromFile(file: File): string {
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

function sanitizeFileName(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._ -]/g, '_');
  return (normalized || 'comprovante').slice(0, 255);
}
