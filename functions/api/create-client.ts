import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ClienteInput = {
  nome?: unknown;
  whatsapp?: unknown;
  instagram?: unknown;
  email?: unknown;
  observacao?: unknown;
  ativo?: unknown;
  marketing_opt_in?: unknown;
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
  const nome = normalizeRequiredText(input.nome);
  const whatsapp = normalizeWhatsapp(input.whatsapp);
  const email = normalizeOptionalText(input.email);
  const instagram = normalizeOptionalText(input.instagram);
  const observacao = normalizeOptionalText(input.observacao);

  if (!nome || nome.length < 2) return json({ error: 'Nome obrigatório' }, 400);
  if (!whatsapp) return json({ error: 'WhatsApp inválido' }, 400);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Email inválido' }, 400);
  }

  const { data, error } = await admin
    .from('clientes')
    .insert({
      nome,
      whatsapp,
      instagram,
      email,
      observacao,
      ativo: input.ativo === false ? false : true,
      marketing_opt_in: input.marketing_opt_in !== false,
      marketing_opt_in_at: input.marketing_opt_in === false ? null : new Date().toISOString(),
      marketing_opt_out_at: input.marketing_opt_in === false ? new Date().toISOString() : null,
      cadastrado_por_user_id: staffCheck.user.id,
    })
    .select('*')
    .single();

  if (error) return json({ error: toClienteErrorMessage(error) }, 400);
  return json({ cliente: data }, 201);
};

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
