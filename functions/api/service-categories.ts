import { createClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

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
  const id = url.searchParams.get('id');
  if (id) {
    const { data, error } = await admin
      .from('servico_categorias')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ categoria: data ?? null }, 200);
  }

  let query = admin
    .from('servico_categorias')
    .select('*')
    .order('ativo', { ascending: false })
    .order('nome', { ascending: true });
  if (url.searchParams.get('ativas') === 'true') query = query.eq('ativo', true);

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);
  return json({ categorias: data ?? [] }, 200);
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

  const action = body['action'];
  const id = body['id'];
  if ((action === 'update' || action === 'toggle' || action === 'delete') && typeof id !== 'string') {
    return json({ error: 'id obrigatório' }, 400);
  }

  if (action === 'delete') {
    const { error } = await admin.from('servico_categorias').delete().eq('id', id);
    if (error) return json({ error: toCategoriaError(error) }, 400);
    return json({ ok: true }, 200);
  }

  if (action === 'toggle') {
    const { error } = await admin
      .from('servico_categorias')
      .update({ ativo: body['ativo'] === true })
      .eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true }, 200);
  }

  const input = buildInput(body);
  if ('error' in input) return json({ error: input.error }, 400);

  if (action === 'update') {
    const { data, error } = await admin
      .from('servico_categorias')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    if (error) return json({ error: toCategoriaError(error) }, 400);
    return json({ categoria: data }, 200);
  }

  const { data, error } = await admin
    .from('servico_categorias')
    .insert(input)
    .select('*')
    .single();
  if (error) return json({ error: toCategoriaError(error) }, 400);
  return json({ categoria: data }, 201);
};

function buildInput(body: Record<string, unknown>) {
  const nome = typeof body['nome'] === 'string' ? body['nome'].trim() : '';
  if (nome.length < 2) return { error: 'Nome obrigatório' };
  return {
    nome,
    descricao: normalizeOptionalText(body['descricao']),
    ativo: body['ativo'] === false ? false : true,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function toCategoriaError(error: { code?: string; message: string }): string {
  if (error.code === '23505') return 'Já existe uma categoria com este nome.';
  if (error.code === '23503') return 'Esta categoria está em uso por serviços cadastrados.';
  return error.message;
}
