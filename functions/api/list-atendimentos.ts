import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos } from '../../drizzle/schema';
import { requireStaff } from './admin-auth';
import {
  atendimentoOwnershipCondition,
  listAtendimentosComRelacoes,
  type AtendimentoState,
} from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

type Context = { request: Request; env: Env };

const ALLOWED_FILTERS = new Set<AtendimentoState>([
  'em_andamento',
  'pagamento',
  'concluido',
  'recusado',
]);

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
  const filter = url.searchParams.get('filter') ?? 'em_andamento';
  if (!ALLOWED_FILTERS.has(filter as AtendimentoState)) return json({ error: 'Filtro inválido' }, 400);
  const clienteId = url.searchParams.get('clienteId')?.trim();
  const todosOsStatus = url.searchParams.get('todosOsStatus') === 'true';

  try {
    const atendimentosVisiveis = await withDatabase(env, async (db) => {
      const conditions: SQL[] = [];
      if (!todosOsStatus) {
        conditions.push(
          filter === 'em_andamento'
            ? inArray(atendimentos.state, ['aguardando_confirmacao', 'em_andamento'])
            : eq(atendimentos.state, filter as typeof atendimentos.$inferSelect.state),
        );
      }
      if (clienteId) conditions.push(eq(atendimentos.clienteId, clienteId));
      if (staffCheck.role === 'vendedor') conditions.push(atendimentoOwnershipCondition(staffCheck.user.id));
      const atendimentoRows = await listAtendimentosComRelacoes(
        db,
        conditions.length > 0 ? and(...conditions) : undefined,
      );
      return atendimentoRows.filter(
        (atendimento) => atendimento.state !== 'concluido' || atendimento.financeiro_contabilizado,
      );
    });
    return json({ atendimentos: atendimentosVisiveis }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar atendimentos' }, 500);
  }
};
