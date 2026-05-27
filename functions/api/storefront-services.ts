import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export const onRequestGet = async ({ env }: Context): Promise<Response> => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await selectVitrine(admin);
  if (error) return json({ error: error.message }, 500);
  return json({ servicos: data ?? [] }, 200);
};

async function selectVitrine(admin: SupabaseClient) {
  const result = await admin
    .from('servicos')
    .select(SELECT)
    .eq('ativo', true)
    .eq('vitrine', true)
    .order('nome', { ascending: true });
  if (!result.error || !isMissingVitrineColumn(result.error)) return result;
  const flags = await readVitrineFlags(admin);

  const legacyResult = await admin
    .from('servicos')
    .select(LEGACY_SELECT)
    .eq('ativo', true)
    .order('nome', { ascending: true });
  return {
    ...legacyResult,
    data: (legacyResult.data ?? [])
      .map((servico) => ({ ...servico, vitrine: flags[servico.id] !== false }))
      .filter((servico) => servico.vitrine),
  };
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
