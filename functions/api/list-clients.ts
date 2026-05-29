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

type AtendimentoPurchaseRow = {
  cliente_id: string;
  servico_id: string | null;
  servico_ids: string[] | null;
  descricao_solicitacao: string | null;
};

type ServicoSearchRow = {
  id: string;
  nome: string;
  descricao: string | null;
};

const FETCH_PAGE_SIZE = 1000;
const CLIENT_ID_CHUNK_SIZE = 200;
const SEARCH_STOP_WORDS = new Set([
  'cliente',
  'clientes',
  'compra',
  'compras',
  'comprado',
  'comprados',
  'compraram',
  'comprou',
  'todos',
  'todas',
]);

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
      const [clientesPorTexto, clientesPorCompraIds, ativos, inativos] = await Promise.all([
        listClientesBySearch(admin, ativo, termo),
        findPurchaseClientIds(admin, termo),
        countByAtivo(admin, true),
        countByAtivo(admin, false),
      ]);
      const clientesPorCompra = await listClientesByIds(admin, ativo, clientesPorCompraIds);
      const clientes = await hydrateClientesUsers(
        admin,
        mergeClientes([...clientesPorTexto, ...clientesPorCompra]),
      );
      return json(
        {
          clientes: clientes.slice(from, to + 1),
          total: clientes.length,
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
  return rows.filter((cliente) => matchesClienteSearch(cliente, termo));
}

async function listClientesByIds(
  admin: SupabaseClient,
  ativo: boolean,
  ids: ReadonlySet<string>,
): Promise<ClienteRow[]> {
  const rows: ClienteRow[] = [];
  const allIds = [...ids];
  for (let index = 0; index < allIds.length; index += CLIENT_ID_CHUNK_SIZE) {
    const chunk = allIds.slice(index, index + CLIENT_ID_CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const { data, error } = await admin
      .from('clientes')
      .select('*')
      .eq('ativo', ativo)
      .in('id', chunk);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as ClienteRow[]));
  }
  return rows;
}

async function findPurchaseClientIds(
  admin: SupabaseClient,
  termo: string,
): Promise<ReadonlySet<string>> {
  const searchTerms = expandSearchTerms(termo);
  const [servicos, atendimentos] = await Promise.all([
    listAllServicos(admin),
    listAllAtendimentos(admin),
  ]);
  const matchingServiceIds = new Set(
    servicos
      .filter((servico) =>
        matchesSearchTerms(`${servico.nome} ${servico.descricao ?? ''}`, searchTerms),
      )
      .map((servico) => servico.id),
  );

  const clienteIds = new Set<string>();
  for (const atendimento of atendimentos) {
    const servicoIds = [
      ...(atendimento.servico_id ? [atendimento.servico_id] : []),
      ...(atendimento.servico_ids ?? []),
    ];
    const matchByService = servicoIds.some((id) => matchingServiceIds.has(id));
    const matchByDescription = matchesSearchTerms(
      atendimento.descricao_solicitacao ?? '',
      searchTerms,
    );
    if (matchByService || matchByDescription) {
      clienteIds.add(atendimento.cliente_id);
    }
  }
  return clienteIds;
}

async function listAllServicos(admin: SupabaseClient): Promise<ServicoSearchRow[]> {
  const rows: ServicoSearchRow[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('servicos')
      .select('id, nome, descricao')
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ServicoSearchRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }
  return rows;
}

async function listAllAtendimentos(admin: SupabaseClient): Promise<AtendimentoPurchaseRow[]> {
  const rows: AtendimentoPurchaseRow[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await admin
      .from('atendimentos')
      .select('cliente_id, servico_id, servico_ids, descricao_solicitacao')
      .order('id', { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as AtendimentoPurchaseRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
  }
  return rows;
}

function mergeClientes(clientes: ClienteRow[]): ClienteRow[] {
  const byId = new Map<string, ClienteRow>();
  for (const cliente of clientes) byId.set(cliente.id, cliente);
  return [...byId.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
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
