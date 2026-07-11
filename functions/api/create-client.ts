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

  try {
    const now = new Date().toISOString();
    const [cliente] = await withDatabase(env, (db) =>
      db
        .insert(clientes)
        .values({
          nome,
          whatsapp,
          instagram,
          email,
          observacao,
          ativo: input.ativo !== false,
          marketingOptIn: input.marketing_opt_in !== false,
          marketingOptInAt: input.marketing_opt_in === false ? null : now,
          marketingOptOutAt: input.marketing_opt_in === false ? now : null,
          cadastradoPorUserId: staffCheck.user.id,
        })
        .returning(),
    );
    return json({ cliente: cliente ? toClienteResponse(cliente) : null }, 201);
  } catch (error) {
    return json({ error: toClienteErrorMessage(error) }, 400);
  }
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

function toClienteErrorMessage(error: unknown): string {
  const candidate = error as { code?: string; message?: string };
  if (candidate.code === '23505') {
    return 'Já existe um cliente cadastrado com este WhatsApp.';
  }
  return typeof candidate.message === 'string' ? candidate.message : 'Erro ao cadastrar cliente';
}
