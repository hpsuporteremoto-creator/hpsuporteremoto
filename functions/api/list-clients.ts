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
  created_at: string;
  updated_at: string;
};

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
  const ativo = staffCheck.role === 'admin' ? requestedAtivo : true;
  const termo = url.searchParams.get('termo')?.trim() ?? '';
  const pageIndex = toNonNegativeInt(url.searchParams.get('pageIndex'), 0);
  const pageSize = Math.min(toNonNegativeInt(url.searchParams.get('pageSize'), 20), 100);
  const from = pageIndex * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('clientes')
    .select('*', { count: 'exact' })
    .eq('ativo', ativo)
    .order('nome', { ascending: true })
    .range(from, to);

  if (termo) {
    query = query.or(createSearchFilter(termo));
  }

  const [{ data, error, count }, ativos, inativos] = await Promise.all([
    query,
    countByAtivo(admin, true),
    staffCheck.role === 'admin' ? countByAtivo(admin, false) : Promise.resolve(0),
  ]);

  if (error) return json({ error: error.message }, 500);

  return json(
    {
      clientes: (data ?? []) as ClienteRow[],
      total: count ?? 0,
      counts: { ativos, inativos },
    },
    200,
  );
};

async function countByAtivo(
  admin: SupabaseClient,
  ativo: boolean,
): Promise<number> {
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

function createSearchFilter(value: string): string {
  const termo = escapePostgrestLike(value);
  const digits = value.replace(/\D/g, '');
  const filters = [
    `nome.ilike.%${termo}%`,
    `email.ilike.%${termo}%`,
    `instagram.ilike.%${termo}%`,
    `observacao.ilike.%${termo}%`,
  ];
  if (digits) filters.push(`whatsapp.ilike.%${digits}%`);
  return filters.join(',');
}

function escapePostgrestLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,');
}
