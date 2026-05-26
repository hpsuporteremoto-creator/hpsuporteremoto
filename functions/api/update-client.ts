import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
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
};

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

  const { data, error } = await admin
    .from('clientes')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) return json({ error: toClienteErrorMessage(error) }, 400);
  return json({ cliente: data }, 200);
};

function buildPatch(input: ClienteInput): Record<string, unknown> | { error: string } {
  const patch: Record<string, unknown> = {};
  if (input.nome !== undefined) {
    const nome = normalizeRequiredText(input.nome);
    if (!nome || nome.length < 2) return { error: 'Nome obrigatório' };
    patch['nome'] = nome;
  }
  if (input.whatsapp !== undefined) {
    const whatsapp = normalizeWhatsapp(input.whatsapp);
    if (!whatsapp) return { error: 'WhatsApp inválido' };
    patch['whatsapp'] = whatsapp;
  }
  if (input.email !== undefined) {
    const email = normalizeOptionalText(input.email);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { error: 'Email inválido' };
    }
    patch['email'] = email;
  }
  if (input.instagram !== undefined) {
    patch['instagram'] = normalizeOptionalText(input.instagram);
  }
  if (input.observacao !== undefined) {
    patch['observacao'] = normalizeOptionalText(input.observacao);
  }
  if (input.ativo !== undefined) {
    patch['ativo'] = input.ativo === true;
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

function toClienteErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === '23505') {
    return 'Já existe um cliente cadastrado com este WhatsApp.';
  }
  return error.message;
}
