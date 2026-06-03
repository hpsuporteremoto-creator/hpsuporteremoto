import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const CONTRATO_STATUS = ['a_iniciar', 'em_andamento', 'finalizado', 'cancelado'] as const;
type ContratoStatus = (typeof CONTRATO_STATUS)[number];

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const url = new URL(request.url);
  const status = normalizeStatus(url.searchParams.get('status'));
  if (url.searchParams.get('status') && !status) {
    return json({ error: 'Status inválido' }, 400);
  }

  let query = admin
    .from('contratos')
    .select(
      `
      id, cliente_id, status, objeto, condicoes, observacoes,
      criado_por_user_id, created_at, updated_at,
      cliente:clientes ( id, nome, whatsapp, email )
    `,
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ contratos: data ?? [] }, 200);
};

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const input = buildInput(body, staffCheck.user.id);
  if ('error' in input) return json({ error: input.error }, 400);

  const { data, error } = await admin
    .from('contratos')
    .insert(input)
    .select(
      `
      id, cliente_id, status, objeto, condicoes, observacoes,
      criado_por_user_id, created_at, updated_at,
      cliente:clientes ( id, nome, whatsapp, email )
    `,
    )
    .single();

  if (error) return json({ error: error.message }, 400);
  return json({ contrato: data }, 201);
};

function buildInput(body: Record<string, unknown>, userId: string) {
  const clienteId = normalizeRequiredText(body['cliente_id']);
  const status = normalizeStatus(body['status']);
  const objeto = normalizeRequiredText(body['objeto']);

  if (!clienteId) return { error: 'Cliente obrigatório' };
  if (!status) return { error: 'Status obrigatório' };
  if (!objeto) return { error: 'Objeto do contrato obrigatório' };

  return {
    cliente_id: clienteId,
    status,
    objeto,
    condicoes: normalizeOptionalText(body['condicoes']),
    observacoes: normalizeOptionalText(body['observacoes']),
    criado_por_user_id: userId,
  };
}

function normalizeStatus(value: unknown): ContratoStatus | null {
  if (typeof value !== 'string') return null;
  return CONTRATO_STATUS.includes(value as ContratoStatus) ? (value as ContratoStatus) : null;
}

function normalizeRequiredText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}
