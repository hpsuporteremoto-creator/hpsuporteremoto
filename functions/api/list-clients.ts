import { asc, count, eq, inArray } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { clientes, profiles } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import { type AppDatabase, type DatabaseEnv, withDatabase } from '../lib/db';
import { type ClienteResponse, toClienteResponse } from '../lib/clientes';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const SEARCH_STOP_WORDS = new Set(['cliente', 'clientes', 'todos', 'todas']);

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
  const ativo = url.searchParams.get('ativo') !== 'false';
  const termo = url.searchParams.get('termo')?.trim() ?? '';
  const pageIndex = toNonNegativeInt(url.searchParams.get('pageIndex'), 0);
  const pageSize = Math.min(Math.max(toNonNegativeInt(url.searchParams.get('pageSize'), 20), 1), 100);

  try {
    const payload = await withDatabase(env, async (db) => {
      const [rows, ativos, inativos] = await Promise.all([
        listClientes(db, ativo),
        db.select({ total: count() }).from(clientes).where(eq(clientes.ativo, true)),
        db.select({ total: count() }).from(clientes).where(eq(clientes.ativo, false)),
      ]);
      const hydrated = await hydrateClientes(db, rows);
      const filtered = termo ? sortClientesBySearch(hydrated.filter((cliente) => matchesClienteSearch(cliente, termo)), termo) : hydrated;
      const from = pageIndex * pageSize;
      return {
        clientes: filtered.slice(from, from + pageSize),
        total: filtered.length,
        counts: {
          ativos: ativos[0]?.total ?? 0,
          inativos: inativos[0]?.total ?? 0,
        },
      };
    });
    return json(payload, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao filtrar clientes' }, 500);
  }
};

async function listClientes(
  db: AppDatabase,
  ativo: boolean,
): Promise<Array<typeof clientes.$inferSelect>> {
  return db.select().from(clientes).where(eq(clientes.ativo, ativo)).orderBy(asc(clientes.nome));
}

async function hydrateClientes(
  db: AppDatabase,
  rows: readonly (typeof clientes.$inferSelect)[],
): Promise<ClienteResponse[]> {
  const ids = Array.from(
    new Set(rows.map((cliente) => cliente.cadastradoPorUserId).filter((id): id is string => Boolean(id))),
  );
  if (ids.length === 0) return rows.map((cliente) => toClienteResponse(cliente));

  const users = await db
    .select({ id: profiles.id, email: profiles.email, full_name: profiles.fullName })
    .from(profiles)
    .where(inArray(profiles.id, ids));
  const usersById = new Map(users.map((user) => [user.id, user]));
  return rows.map((cliente) =>
    toClienteResponse(
      cliente,
      cliente.cadastradoPorUserId ? (usersById.get(cliente.cadastradoPorUserId) ?? null) : null,
    ),
  );
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
  return value.length >= 3 && !SEARCH_STOP_WORDS.has(normalizeSearchKey(value));
}

function segmentSynonyms(value: string): string[] {
  const key = normalizeSearchKey(value);
  if (key.startsWith('arquitet')) return ['arquitet', 'arquitetura', 'arquiteto', 'arquiteta'];
  if (key.startsWith('engenh')) return ['engenh', 'engenharia', 'engenheiro', 'engenheira'];
  return [];
}

function normalizeSearchKey(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function matchesClienteSearch(cliente: ClienteResponse, termo: string): boolean {
  if (looksLikeEmailSearch(termo)) return matchesEmailSearch(cliente.email, termo);
  const searchableText = [cliente.nome, cliente.email, cliente.instagram, cliente.observacao]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  const whatsappDigits = cliente.whatsapp.replace(/\D/g, '');
  return (
    matchesSearchTerms(searchableText, expandSearchTerms(termo)) ||
    normalizePhoneCandidates(termo).some((digits) => whatsappDigits.includes(digits))
  );
}

function sortClientesBySearch(clientesEncontrados: readonly ClienteResponse[], termo: string): ClienteResponse[] {
  return [...clientesEncontrados].sort((a, b) => {
    const score = clienteSearchScore(b, termo) - clienteSearchScore(a, termo);
    return score || a.nome.localeCompare(b.nome);
  });
}

function clienteSearchScore(cliente: ClienteResponse, termo: string): number {
  const phrase = normalizeSearchKey(termo).replace(/\s+/g, ' ').trim();
  const terms = expandSearchTerms(termo);
  let score = scoreTextField(cliente.nome, phrase, terms, [1200, 900, 700, 260, 190, 110]);
  const emailWeights: [number, number, number, number, number, number] = looksLikeEmailSearch(termo)
    ? [1000, 760, 620, 60, 45, 28]
    : [120, 90, 70, 60, 45, 28];
  score += scoreTextField(cliente.email ?? '', phrase, terms, emailWeights);
  score += scoreTextField(cliente.instagram ?? '', phrase, terms, [95, 72, 52, 38, 28, 18]);
  score += scoreTextField(cliente.observacao ?? '', phrase, terms, [55, 36, 24, 18, 12, 8]);
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
  weights: readonly [number, number, number, number, number, number],
): number {
  const normalized = normalizeSearchKey(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return 0;
  let score = 0;
  if (phrase) {
    if (normalized === phrase) score += weights[0];
    else if (normalized.startsWith(phrase)) score += weights[1];
    else if (phrase.length >= 3 && normalized.includes(phrase)) score += weights[2];
  }
  const tokens = tokenizeSearchValue(normalized);
  for (const term of terms.map(normalizeSearchKey)) {
    if (tokens.includes(term)) score += weights[3];
    else if (tokens.some((token) => token.startsWith(term))) score += weights[4];
    else if (term.length >= 3 && tokens.some((token) => token.includes(term))) score += weights[5];
  }
  return score;
}

function tokenizeSearchValue(value: string): string[] {
  return value.replace(/[^\p{Letter}\p{Number}@.]+/gu, ' ').split(' ').filter(isSearchToken);
}

function looksLikeEmailSearch(value: string): boolean {
  return value.includes('@');
}

function matchesEmailSearch(email: string | null, termo: string): boolean {
  return email !== null && normalizeSearchKey(email).includes(normalizeSearchKey(termo));
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
