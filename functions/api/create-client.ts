import { createClient } from '@supabase/supabase-js';
import { clientes } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { toClienteResponse } from '../lib/clientes';
import { readJson, z } from '../lib/validation';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const clienteInputSchema = z.object({
  nome: z
    .string()
    .trim()
    .transform((value) => value.replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Nome deve ter ao menos 2 caracteres')),
  whatsapp: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().min(10, 'WhatsApp inválido').max(15, 'WhatsApp inválido')),
  email: z.string().trim().toLowerCase().email('Email inválido').nullable().optional().transform((value) => value ?? null),
  instagram: z.string().trim().max(120).nullable().optional().transform((value) => value || null),
  observacao: z.string().trim().max(20_000).nullable().optional().transform((value) => value || null),
  ativo: z.boolean().optional().default(true),
  marketing_opt_in: z.boolean().optional().default(true),
});

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

  const parsed = await readJson(request, clienteInputSchema);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const input = parsed.data;

  try {
    const now = new Date().toISOString();
    const [cliente] = await withDatabase(env, (db) =>
      db
        .insert(clientes)
        .values({
          nome: input.nome,
          whatsapp: input.whatsapp,
          instagram: input.instagram,
          email: input.email,
          observacao: input.observacao,
          ativo: input.ativo,
          marketingOptIn: input.marketing_opt_in,
          marketingOptInAt: input.marketing_opt_in ? now : null,
          marketingOptOutAt: input.marketing_opt_in ? null : now,
          cadastradoPorUserId: staffCheck.user.id,
        })
        .returning(),
    );
    return json({ cliente: cliente ? toClienteResponse(cliente) : null }, 201);
  } catch (error) {
    return json({ error: toClienteErrorMessage(error) }, 400);
  }
};

function toClienteErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') {
    return 'Já existe um cliente cadastrado com este WhatsApp.';
  }
  return typeof candidate.message === 'string' ? candidate.message : 'Erro ao cadastrar cliente';
}
