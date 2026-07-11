import { and, count, eq, gte, inArray, lt, lte } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { atendimentos, clientes, servicos, transacoes } from '../../drizzle/schema';
import { requireAdmin } from './admin-auth';
import { listAtendimentosComRelacoes } from './atendimentos-shared';
import { type DatabaseEnv, withDatabase } from '../lib/db';

type Env = DatabaseEnv & { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };
type Context = { request: Request; env: Env };
type State = 'em_andamento' | 'pagamento' | 'concluido' | 'recusado';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);
  try {
    const data = await withDatabase(env, async (db) => {
      const today = localDate();
      const monthStart = `${today.slice(0, 8)}01`;
      const from30 = shiftDate(today, -29);
      const tomorrow = shiftDate(today, 1);
      const [clientesAtivos, servicosAtivos, transacoesMes, transacoes30, atendimentosRows, todayRows, ...stateCounts] = await Promise.all([
        db.select({ total: count() }).from(clientes).where(eq(clientes.ativo, true)),
        db.select({ total: count() }).from(servicos).where(eq(servicos.ativo, true)),
        db.select({ tipo: transacoes.tipo, valor_centavos: transacoes.valorCentavos, data: transacoes.data }).from(transacoes).where(and(gte(transacoes.data, monthStart), lte(transacoes.data, today))),
        db.select({ tipo: transacoes.tipo, valor_centavos: transacoes.valorCentavos, data: transacoes.data }).from(transacoes).where(and(gte(transacoes.data, from30), lte(transacoes.data, today))),
        db.select({ created_at: atendimentos.createdAt }).from(atendimentos).where(gte(atendimentos.createdAt, `${from30}T00:00:00.000Z`)),
        listAtendimentosComRelacoes(db, and(gte(atendimentos.createdAt, `${today}T00:00:00.000Z`), lt(atendimentos.createdAt, `${tomorrow}T00:00:00.000Z`))),
        ...(['em_andamento', 'pagamento', 'concluido', 'recusado'] as const).map((state) =>
          db.select({ total: count() }).from(atendimentos).where(state === 'em_andamento' ? inArray(atendimentos.state, ['aguardando_confirmacao', 'em_andamento']) : eq(atendimentos.state, state)),
        ),
      ]);
      const receitaMesCentavos = sum(transacoesMes, 'entrada');
      const receitaHojeCentavos = transacoesMes.filter((row) => row.data === today && row.tipo === 'entrada').reduce((total, row) => total + row.valor_centavos, 0);
      const saldo30DiasCentavos = transacoes30.reduce((total, row) => total + (row.tipo === 'entrada' ? row.valor_centavos : -row.valor_centavos), 0);
      return {
        clientesAtivos: clientesAtivos[0]?.total ?? 0,
        servicosAtivos: servicosAtivos[0]?.total ?? 0,
        receitaHojeCentavos,
        receitaMesCentavos,
        saldo30DiasCentavos,
        atendimentos30Dias: atendimentosRows.length,
        atendimentosHoje: todayRows
          .filter((row) => row.state !== 'concluido' || row.financeiro_contabilizado)
          .map((row) => ({ id: row.id, clienteNome: row.cliente.nome, servicos: row.servicos_solicitados, descontoCentavos: row.desconto_centavos, acrescimoCentavos: row.acrescimo_centavos, valorCentavos: row.valor_centavos ?? Math.max(row.servicos_solicitados.reduce((total, service) => total + service.subtotal_centavos, 0) + row.acrescimo_centavos - row.desconto_centavos, 0), descricaoSolicitacao: row.descricao_solicitacao, state: row.state, createdAt: row.created_at })),
        stateCounts: (['em_andamento', 'pagamento', 'concluido', 'recusado'] as State[]).map((state, index) => ({ state, label: stateLabel(state), count: stateCounts[index]?.[0]?.total ?? 0 })),
        daily: buildDaily(from30, today, transacoes30, atendimentosRows),
      };
    });
    return json(data);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao carregar painel' }, 500);
  }
};

function localDate(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Recife',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get('year')}-${byType.get('month')}-${byType.get('day')}`;
}

function shiftDate(value: string, offset: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function sum(rows: readonly { tipo: string; valor_centavos: number }[], type: string): number {
  return rows.filter((row) => row.tipo === type).reduce((total, row) => total + row.valor_centavos, 0);
}

function stateLabel(state: State): string {
  return { em_andamento: 'Em atendimento', pagamento: 'Pagamento', concluido: 'Concluídos', recusado: 'Recusados' }[state];
}

function buildDaily(
  from: string,
  to: string,
  transactions: readonly { tipo: string; valor_centavos: number; data: string }[],
  rows: readonly { created_at: string }[],
) {
  const days = new Map<string, { date: string; label: string; entradasCentavos: number; saidasCentavos: number; saldoCentavos: number; atendimentos: number }>();
  for (let date = from; date <= to; date = shiftDate(date, 1)) days.set(date, { date, label: date.slice(8, 10), entradasCentavos: 0, saidasCentavos: 0, saldoCentavos: 0, atendimentos: 0 });
  for (const transaction of transactions) {
    const point = days.get(transaction.data);
    if (!point) continue;
    if (transaction.tipo === 'entrada') point.entradasCentavos += transaction.valor_centavos;
    else point.saidasCentavos += transaction.valor_centavos;
    point.saldoCentavos = point.entradasCentavos - point.saidasCentavos;
  }
  for (const row of rows) {
    const point = days.get(row.created_at.slice(0, 10));
    if (point) point.atendimentos += 1;
  }
  return [...days.values()];
}
