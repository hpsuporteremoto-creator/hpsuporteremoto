import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireStaff } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

type ClienteRow = {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
  cadastrado_por_user_id: string | null;
  cadastrado_por?: UserRef | null;
  created_at: string;
  updated_at: string;
};

type UserRef = {
  id: string;
  email: string;
  full_name: string | null;
};

const FETCH_PAGE_SIZE = 1000;
const SEARCH_STOP_WORDS = new Set(['cliente', 'clientes', 'todos', 'todas']);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const staffCheck = await requireStaff(admin, request);
  if (!staffCheck.ok) return json({ error: staffCheck.error }, staffCheck.status);

  const url = new URL(request.url);
  const requestedAtivo = url.searchParams.get('ativo') !== 'false';
  const ativo = requestedAtivo;
  const termo = url.searchParams.get('termo')?.trim() ?? '';
  const pageIndex = toNonNegativeInt(url.searchParams.get('pageIndex'), 0);
  const pageSize = Math.min(toNonNegativeInt(url.searchParams.get('pageSize'), 20), 100);
  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;

  if (termo) {
    try {
      const [clientes, ativos, inativos] = await Promise.all([
        listClientesBySearch(admin, ativo, termo),
        countByAtivo(admin, true),
        countByAtivo(admin, false),
      ]);
      const hydrated = await hydrateClientesUsers(admin, clientes);
      return json(
        {
          clientes: hydrated.slice(from, to + 1),
          total: hydrated.length,
          counts: { ativos, inativos },
        },
        200,
      );
    } catch (err) {
      return json(
        {
          error: err instanceof Error ? err.message : 'Erro ao filtrar clientes',
        },
        500,
      );
    }
  }

  const query = admin
    .from('clientes')
    .select('*', { count: 'exact' })
    .eq('ativo', ativo)
    .order('nome', { ascending: true })
    .range(from, to);

  const [{ data, error, count }, ativos, inativos] = await Promise.all([
    query,
    countByAtivo(admin, true),
    countByAtivo(admin, false),
  ]);

  if (error) return json({ error: error.message }, 500);

  const clientes = await hydrateClientesUsers(admin, (data ?? []) as ClienteRow[]);

  return json(
    {
      clientes,
      total: count ?? 0,
      counts: { ativos, inativos },
    },
    200,
  );
};

async function listClientesBySearch(
  admin: SupabaseClient,
  ativo: boolean,
  termo: string,
): Promise<ClienteRow[]> {
  const rows: ClienteRow[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('clientes')
      .select('*')
      .eq('ativo', ativo)
      .order('nome', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ClienteRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }
  return sortClientesBySearch(
    rows.filter((cliente) => matchesClienteSearch(cliente, termo)),
    termo,
  );
}

async function hydrateClientesUsers(
  admin: SupabaseClient,
  clientes: ClienteRow[],
): Promise<ClienteRow[]> {
  const ids = Array.from(new Set(clientes.map((cliente) => cliente.cadastrado_por_user_id))).filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );

  if (ids.length === 0) {
    return clientes.map((cliente) => ({ ...cliente, cadastrado_por: null }));
  }

  const { data, error } = await admin.from('profiles').select('id, email, full_name').in('id', ids);
  if (error) throw new Error(error.message);

  const usersById = new Map(((data ?? []) as UserRef[]).map((user) => [user.id, user]));
  return clientes.map((cliente) => ({
    ...cliente,
    cadastrado_por: cliente.cadastrado_por_user_id
      ? (usersById.get(cliente.cadastrado_por_user_id) ?? null)
      : null,
  }));
}

async function countByAtivo(admin: SupabaseClient, ativo: boolean): Promise<number> {
  const { count, error } = await admin
    .from('clientes')
    .select('id', { count: 'exact', head: true })
    .eq('ativo', ativo);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

function toNonNegativeInt(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function expandSearchTerms(value: string): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim();
  const candidates = new Set<string>();
  if (normalized.length > 0) candidates.add(normalized);

  for (const token of normalized.split(' ').filter(isSearchToken)) {
    candidates.add(token);
    for (const synonym of segmentSynonyms(token)) candidates.add(synonym);
  }

  return [...candidates].slice(0, 24);
}

function isSearchToken(value: string): boolean {
  if (value.length < 3) return false;
  return !SEARCH_STOP_WORDS.has(normalizeSearchKey(value));
}

function segmentSynonyms(value: string): string[] {
  const key = normalizeSearchKey(value);
  if (key.startsWith('arquitet')) {
    return ['arquitet', 'arquitetura', 'arquiteto', 'arquiteta'];
  }
  if (key.startsWith('engenh')) {
    return ['engenh', 'engenharia', 'engenheiro', 'engenheira'];
  }
  return [];
}

function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function matchesClienteSearch(cliente: ClienteRow, termo: string): boolean {
  if (looksLikeEmailSearch(termo)) {
    return matchesEmailSearch(cliente.email, termo);
  }

  const searchTerms = expandSearchTerms(termo);
  const searchableText = [cliente.nome, cliente.email, cliente.instagram, cliente.observacao]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  const phoneCandidates = normalizePhoneCandidates(termo);
  const whatsappDigits = cliente.whatsapp.replace(/\D/g, '');
  return (
    matchesSearchTerms(searchableText, searchTerms) ||
    phoneCandidates.some((digits) => whatsappDigits.includes(digits))
  );
}

function sortClientesBySearch(clientes: readonly ClienteRow[], termo: string): ClienteRow[] {
  return [...clientes].sort((a, b) => {
    const score = clienteSearchScore(b, termo) - clienteSearchScore(a, termo);
    return score || a.nome.localeCompare(b.nome);
  });
}

function clienteSearchScore(cliente: ClienteRow, termo: string): number {
  const phrase = normalizeSearchKey(termo).replace(/\s+/g, ' ').trim();
  const terms = expandSearchTerms(termo);
  let score = 0;

  score += scoreTextField(cliente.nome, phrase, terms, {
    exactPhrase: 1200,
    prefixPhrase: 900,
    containsPhrase: 700,
    exactToken: 260,
    prefixToken: 190,
    containsToken: 110,
  });
  score += scoreTextField(cliente.email ?? '', phrase, terms, {
    exactPhrase: looksLikeEmailSearch(termo) ? 1000 : 120,
    prefixPhrase: looksLikeEmailSearch(termo) ? 760 : 90,
    containsPhrase: looksLikeEmailSearch(termo) ? 620 : 70,
    exactToken: 60,
    prefixToken: 45,
    containsToken: 28,
  });
  score += scoreTextField(cliente.instagram ?? '', phrase, terms, {
    exactPhrase: 95,
    prefixPhrase: 72,
    containsPhrase: 52,
    exactToken: 38,
    prefixToken: 28,
    containsToken: 18,
  });
  score += scoreTextField(cliente.observacao ?? '', phrase, terms, {
    exactPhrase: 55,
    prefixPhrase: 36,
    containsPhrase: 24,
    exactToken: 18,
    prefixToken: 12,
    containsToken: 8,
  });

  const whatsappDigits = cliente.whatsapp.replace(/\D/g, '');
  for (const digits of normalizePhoneCandidates(termo)) {
    if (whatsappDigits === digits) score += 420;
    else if (whatsappDigits.endsWith(digits)) score += 280;
    else if (whatsappDigits.includes(digits)) score += 160;
  }

  return score;
}

function scoreTextField(
  value: string,
  phrase: string,
  terms: readonly string[],
  weights: {
    exactPhrase: number;
    prefixPhrase: number;
    containsPhrase: number;
    exactToken: number;
    prefixToken: number;
    containsToken: number;
  },
): number {
  const normalized = normalizeSearchKey(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;

  let score = 0;
  if (phrase) {
    if (normalized === phrase) score += weights.exactPhrase;
    else if (normalized.startsWith(phrase)) score += weights.prefixPhrase;
    else if (phrase.length >= 3 && normalized.includes(phrase)) score += weights.containsPhrase;
  }

  const tokens = tokenizeSearchValue(normalized);
  for (const term of terms.map(normalizeSearchKey)) {
    if (tokens.includes(term)) score += weights.exactToken;
    else if (tokens.some((token) => token.startsWith(term))) score += weights.prefixToken;
    else if (term.length >= 3 && tokens.some((token) => token.includes(term))) {
      score += weights.containsToken;
    }
  }

  return score;
}

function tokenizeSearchValue(value: string): string[] {
  return value
    .replace(/[^\p{Letter}\p{Number}@.]+/gu, ' ')
    .split(' ')
    .filter(isSearchToken);
}

function looksLikeEmailSearch(value: string): boolean {
  return value.includes('@');
}

function matchesEmailSearch(email: string | null, termo: string): boolean {
  if (!email) return false;
  return normalizeSearchKey(email).includes(normalizeSearchKey(termo));
}

function matchesSearchTerms(value: string, terms: readonly string[]): boolean {
  const normalizedValue = normalizeSearchKey(value);
  return terms.some((term) => normalizedValue.includes(normalizeSearchKey(term)));
}

function normalizePhoneCandidates(value: string): string[] {
  const digits = value.replace(/\D/g, '');
  if (!digits) return [];
  const candidates = new Set([digits]);
  if (digits.startsWith('55') && digits.length >= 12) candidates.add(digits.slice(2));
  return [...candidates];
}
