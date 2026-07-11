import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { clientes } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { toClienteResponse } from '../lib/clientes';
import { readJson, uuidSchema, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

const clientePatchSchema = z
  .object({
    id: uuidSchema,
    nome: z
      .string()
      .trim()
      .transform((value) => value.replace(/\s+/g, ' '))
      .pipe(z.string().min(2, 'Nome obrigatório').max(180))
      .optional(),
    whatsapp: z
      .string()
      .transform((value) => value.replace(/\D/g, ''))
      .pipe(z.string().min(10, 'WhatsApp inválido').max(15, 'WhatsApp inválido'))
      .optional(),
    instagram: optionalText(160),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(320)
      .nullable()
      .optional()
      .transform((value) => (value === undefined ? undefined : value || null))
      .refine((value) => value === undefined || value === null || z.string().email().safeParse(value).success, {
        message: 'Email inválido',
      }),
    observacao: optionalText(20_000),
    ativo: z.boolean().optional(),
    marketing_opt_in: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.nome !== undefined ||
      value.whatsapp !== undefined ||
      value.instagram !== undefined ||
      value.email !== undefined ||
      value.observacao !== undefined ||
      value.ativo !== undefined ||
      value.marketing_opt_in !== undefined,
    { message: 'Informe ao menos um campo para atualizar' },
  );

type ClienteInput = z.infer<typeof clientePatchSchema>;

type ClientePatch = Partial<
  Pick<
    typeof clientes.$inferInsert,
    | 'nome'
    | 'whatsapp'
    | 'instagram'
    | 'email'
    | 'observacao'
    | 'ativo'
    | 'marketingOptIn'
    | 'marketingOptInAt'
    | 'marketingOptOutAt'
  >
>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const parsed = await readJson(request, clientePatchSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.data;

  const patch = buildPatch(input);
  if ('error' in patch) return json({ error: patch.error }, 400);

  try {
    const [cliente] = await withDatabase(env, (db) =>
      db.update(clientes).set(patch).where(eq(clientes.id, input.id)).returning(),
    );
    if (!cliente) return json({ error: 'Cliente não encontrado' }, 404);
    return json({ cliente: toClienteResponse(cliente) }, 200);
  } catch (error) {
    return json({ error: toClienteErrorMessage(error) }, 400);
  }
};

function buildPatch(input: ClienteInput): ClientePatch | { error: string } {
  const patch: ClientePatch = {};
  if (input.nome !== undefined) patch.nome = input.nome;
  if (input.whatsapp !== undefined) patch.whatsapp = input.whatsapp;
  if (input.email !== undefined) patch.email = input.email;
  if (input.instagram !== undefined) patch.instagram = input.instagram;
  if (input.observacao !== undefined) patch.observacao = input.observacao;
  if (input.ativo !== undefined) patch.ativo = input.ativo;
  if (input.marketing_opt_in !== undefined) {
    const marketingOptIn = input.marketing_opt_in;
    const now = new Date().toISOString();
    patch.marketingOptIn = marketingOptIn;
    patch.marketingOptInAt = marketingOptIn ? now : null;
    patch.marketingOptOutAt = marketingOptIn ? null : now;
  }
  return patch;
}

function toClienteErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') return 'Já existe um cliente cadastrado com este WhatsApp.';
  return typeof candidate.message === 'string' ? candidate.message : 'Erro ao atualizar cliente';
}
