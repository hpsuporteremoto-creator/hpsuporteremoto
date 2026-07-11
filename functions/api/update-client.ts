import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { clientes } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type DatabaseEnv, withDatabase } from '../lib/db';
import { toClienteResponse } from '../lib/clientes';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ClienteInput = {
  id?: unknown;
  nome?: unknown;
  whatsapp?: unknown;
  instagram?: unknown;
  email?: unknown;
  observacao?: unknown;
  ativo?: unknown;
  marketing_opt_in?: unknown;
};

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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const input = body as ClienteInput;
  if (typeof input.id !== 'string' || input.id.length === 0) {
    return json({ error: 'id obrigatório' }, 400);
  }

  const patch = buildPatch(input);
  if ('error' in patch) return json({ error: patch.error }, 400);

  try {
    const [cliente] = await withDatabase(env, (db) =>
      db.update(clientes).set(patch).where(eq(clientes.id, input.id as string)).returning(),
    );
    if (!cliente) return json({ error: 'Cliente não encontrado' }, 404);
    return json({ cliente: toClienteResponse(cliente) }, 200);
  } catch (error) {
    return json({ error: toClienteErrorMessage(error) }, 400);
  }
};

function buildPatch(input: ClienteInput): ClientePatch | { error: string } {
  const patch: ClientePatch = {};
  if (input.nome !== undefined) {
    const nome = normalizeRequiredText(input.nome);
    if (!nome || nome.length < 2) return { error: 'Nome obrigatório' };
    patch.nome = nome;
  }
  if (input.whatsapp !== undefined) {
    const whatsapp = normalizeWhatsapp(input.whatsapp);
    if (!whatsapp) return { error: 'WhatsApp inválido' };
    patch.whatsapp = whatsapp;
  }
  if (input.email !== undefined) {
    const email = normalizeOptionalText(input.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Email inválido' };
    patch.email = email;
  }
  if (input.instagram !== undefined) patch.instagram = normalizeOptionalText(input.instagram);
  if (input.observacao !== undefined) patch.observacao = normalizeOptionalText(input.observacao);
  if (input.ativo !== undefined) patch.ativo = input.ativo === true;
  if (input.marketing_opt_in !== undefined) {
    const marketingOptIn = input.marketing_opt_in === true;
    const now = new Date().toISOString();
    patch.marketingOptIn = marketingOptIn;
    patch.marketingOptInAt = marketingOptIn ? now : null;
    patch.marketingOptOutAt = marketingOptIn ? null : now;
  }
  return patch;
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function normalizeWhatsapp(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

function toClienteErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') return 'Já existe um cliente cadastrado com este WhatsApp.';
  return typeof candidate.message === 'string' ? candidate.message : 'Erro ao atualizar cliente';
}
