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
  valor_centavos, ativo, vitrine, created_at,
  categoria:servico_categorias ( id, nome, descricao, ativo )
`;

const LEGACY_SELECT = `
  id, nome, categoria_id, descricao, imagem_url,
  valor_centavos, ativo, created_at,
  categoria:servico_categorias ( id, nome, descricao, ativo )
`;
const CONFIG_BUCKET = 'app-config';
const VITRINE_FLAGS_PATH = 'vitrine-flags.json';

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
    const { data, error } = await selectServicoById(admin, id);
    if (error) return json({ error: error.message }, 500);
    return json({ servico: data ?? null }, 200);
  }

  const ativoParam = url.searchParams.get('ativo');
  const { data, error } = await selectServicos(admin, ativoParam);
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
    const result = await admin
      .from('servicos')
      .update(input)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (result.error && isMissingVitrineColumn(result.error)) {
      const { vitrine: _vitrine, ...legacyInput } = input;
      const legacyResult = await admin
        .from('servicos')
        .update(legacyInput)
        .eq('id', id)
        .select(LEGACY_SELECT)
        .single();
      if (legacyResult.error) return json({ error: legacyResult.error.message }, 500);
      await setVitrineFlag(admin, legacyResult.data.id, input.vitrine);
      return json({ servico: withVitrineFlag(legacyResult.data, input.vitrine) }, 200);
    }
    if (result.error) return json({ error: result.error.message }, 500);
    return json({ servico: result.data }, 200);
  }

  const result = await admin
    .from('servicos')
    .insert(input)
    .select(SELECT)
    .single();
  if (result.error && isMissingVitrineColumn(result.error)) {
    const { vitrine: _vitrine, ...legacyInput } = input;
    const legacyResult = await admin
      .from('servicos')
      .insert(legacyInput)
      .select(LEGACY_SELECT)
      .single();
    if (legacyResult.error) return json({ error: legacyResult.error.message }, 500);
    await setVitrineFlag(admin, legacyResult.data.id, input.vitrine);
    return json({ servico: withVitrineFlag(legacyResult.data, input.vitrine) }, 201);
  }
  if (result.error) return json({ error: result.error.message }, 500);
  return json({ servico: result.data }, 201);
};

async function selectServicoById(admin: SupabaseClient, id: string) {
  const result = await admin
    .from('servicos')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (!result.error || !isMissingVitrineColumn(result.error)) return result;
  const flags = await readVitrineFlags(admin);
  const legacyResult = await admin
    .from('servicos')
    .select(LEGACY_SELECT)
    .eq('id', id)
    .maybeSingle();
  return {
    ...legacyResult,
    data: legacyResult.data
      ? withVitrineFlag(legacyResult.data, flags[legacyResult.data.id] !== false)
      : null,
  };
}

async function selectServicos(admin: SupabaseClient, ativoParam: string | null) {
  let query = admin
    .from('servicos')
    .select(SELECT)
    .order('nome', { ascending: true });
  if (ativoParam === 'true' || ativoParam === 'false') {
    query = query.eq('ativo', ativoParam === 'true');
  }
  const result = await query;
  if (!result.error || !isMissingVitrineColumn(result.error)) return result;
  const flags = await readVitrineFlags(admin);

  let legacyQuery = admin
    .from('servicos')
    .select(LEGACY_SELECT)
    .order('nome', { ascending: true });
  if (ativoParam === 'true' || ativoParam === 'false') {
    legacyQuery = legacyQuery.eq('ativo', ativoParam === 'true');
  }
  const legacyResult = await legacyQuery;
  return {
    ...legacyResult,
    data: (legacyResult.data ?? []).map((servico) =>
      withVitrineFlag(servico, flags[servico.id] !== false),
    ),
  };
}

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
    vitrine: body['vitrine'] === false ? false : true,
  };
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function isMissingVitrineColumn(error: { code?: string; message: string }): boolean {
  const message = error.message.toLowerCase();
  return (
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    message.includes('servicos.vitrine') ||
    (message.includes('vitrine') && message.includes('servicos'))
  );
}

function withVitrineFlag<T extends Record<string, unknown>>(
  row: T,
  vitrine: boolean,
): T & { vitrine: boolean } {
  return { ...row, vitrine };
}

async function readVitrineFlags(admin: SupabaseClient): Promise<Record<string, boolean>> {
  const { data, error } = await admin.storage.from(CONFIG_BUCKET).download(VITRINE_FLAGS_PATH);
  if (error || !data) return {};
  try {
    const parsed = JSON.parse(await data.text()) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, boolean>)
      : {};
  } catch {
    return {};
  }
}

async function setVitrineFlag(
  admin: SupabaseClient,
  servicoId: string,
  vitrine: boolean,
): Promise<void> {
  await ensureConfigBucket(admin);
  const flags = await readVitrineFlags(admin);
  flags[servicoId] = vitrine;
  await admin.storage.from(CONFIG_BUCKET).upload(
    VITRINE_FLAGS_PATH,
    new Blob([JSON.stringify(flags)], { type: 'application/json' }),
    { contentType: 'application/json', upsert: true },
  );
}

async function ensureConfigBucket(admin: SupabaseClient): Promise<void> {
  const { data, error } = await admin.storage.getBucket(CONFIG_BUCKET);
  if (!error && data) return;
  await admin.storage.createBucket(CONFIG_BUCKET, { public: false });
}
