import { eq, inArray } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, clientes } from '../../drizzle/schema';
import { listAtendimentosComRelacoes, type AtendimentoComRelacoes } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & {
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
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return json({ error: 'Entre com Google para ver seus pedidos.' }, 401);
  }
  const token = authHeader.slice('bearer '.length).trim();
  const {
    data: { user },
    error: authError,
  } = await admin.auth.getUser(token);
  const email = user?.email?.trim();
  if (authError || !email) return json({ error: 'Sessão inválida' }, 401);

  try {
    const atendimentosDoCliente = await withDatabase(env, async (db) => {
      const customerRows = await db
        .select({ id: clientes.id })
        .from(clientes)
        .where(eq(clientes.email, email));
      const clienteIds = customerRows.map((cliente) => cliente.id);
      if (clienteIds.length === 0) return [];
      return listAtendimentosComRelacoes(db, inArray(atendimentos.clienteId, clienteIds));
    });
    return json({ atendimentos: atendimentosDoCliente.map(toPublicAtendimento) }, 200);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar pedidos' }, 500);
  }
};

function toPublicAtendimento(atendimento: AtendimentoComRelacoes): Record<string, unknown> {
  const {
    criado_por_user_id: _createdById,
    vendido_por_user_id: _soldById,
    atendido_por_user_id: _attendedById,
    criado_por: _createdBy,
    vendido_por: _soldBy,
    atendido_por: _attendedBy,
    financeiro_contabilizado: _accounting,
    financeiro_transacao_id: _transactionId,
    transacoes: _transactions,
    ...publicAtendimento
  } = atendimento;
  return publicAtendimento;
}
