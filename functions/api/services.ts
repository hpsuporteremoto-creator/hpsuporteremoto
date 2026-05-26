import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const SELECT = `
  id, nome, categoria_id, descricao, imagem_url,
  valor_centavos, ativo, created_at,
  categoria:servico_categorias ( id, nome, descricao, ativo )
`;

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
      .from('servicos')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data ?? null }, 200);
  }

  const ativoParam = url.searchParams.get('ativo');
  let query = admin
    .from('servicos')
    .select(SELECT)
    .order('nome', { ascending: true });
  if (ativoParam === 'true' || ativoParam === 'false') {
    query = query.eq('ativo', ativoParam === 'true');
  }
  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const [ativos, inativos] = await Promise.all([
    countByAtivo(admin, true),
    countByAtivo(admin, false),
  ]);
  return json({ servicos: data ?? [], counts: { ativos, inativos } }, 200);
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
  if (action === 'toggle') {
    const id = body['id'];
    if (typeof id !== 'string') return json({ error: 'id obrigatório' }, 400);
    const { error } = await admin
      .from('servicos')
      .update({ ativo: body['ativo'] === true })
      .eq('id', id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true }, 200);
  }

  const input = buildServicoInput(body);
  if ('error' in input) return json({ error: input.error }, 400);

  if (action === 'update') {
    const id = body['id'];
    if (typeof id !== 'string') return json({ error: 'id obrigatório' }, 400);
    const { data, error } = await admin
      .from('servicos')
      .update(input)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data }, 200);
  }

  const { data, error } = await admin
    .from('servicos')
    .insert(input)
    .select(SELECT)
    .single();
  if (error) return json({ error: error.message }, 500);
  return json({ servico: data }, 201);
};

async function countByAtivo(admin: SupabaseClient, ativo: boolean) {
  const { count, error } = await admin
    .from('servicos')
    .select('id', { count: 'exact', head: true })
    .eq('ativo', ativo);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function buildServicoInput(body: Record<string, unknown>) {
  const nome = typeof body['nome'] === 'string' ? body['nome'].trim() : '';
  const valor = body['valor_centavos'];
  if (nome.length < 2) return { error: 'Nome obrigatório' };
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) {
    return { error: 'Valor inválido' };
  }
  return {
    nome,
    categoria_id: typeof body['categoria_id'] === 'string' ? body['categoria_id'] : null,
    descricao: normalizeOptionalText(body['descricao']),
    imagem_url: normalizeOptionalText(body['imagem_url']),
    valor_centavos: valor,
    ativo: body['ativo'] === false ? false : true,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}
