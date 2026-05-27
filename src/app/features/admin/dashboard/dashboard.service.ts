import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { ATENDIMENTO_STATE_LABEL, AtendimentoState } from '../atendimentos/atendimentos.types';
import { Transacao } from '../financeiro/financeiro.types';
import {
  AdminDashboardData,
  DashboardDailyPoint,
  DashboardServicoRef,
  DashboardStateCount,
  DashboardTodayAtendimento,
} from './dashboard.types';

interface AtendimentoDiaRow {
  readonly created_at: string;
}

interface AtendimentoHojeRow {
  readonly id: string;
  readonly servico_id: string | null;
  readonly servico_ids: string[] | null;
  readonly descricao_solicitacao: string | null;
  readonly state: AtendimentoState;
  readonly created_at: string;
  readonly cliente: {
    readonly nome: string;
  } | null;
}

const STATES: readonly AtendimentoState[] = ['em_andamento', 'pagamento', 'concluido', 'recusado'];

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SupabaseService).client;

  async load(): Promise<AdminDashboardData> {
    const today = new Date();
    const todayStart = this.startOfDay(today);
    const tomorrowStart = this.addDays(todayStart, 1);
    const from30 = this.addDays(today, -29);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      stateCounts,
      clientesAtivos,
      servicosAtivos,
      transacoesMes,
      transacoes30Dias,
      atendimentos30Dias,
      atendimentosHoje,
    ] = await Promise.all([
      this.countStates(),
      this.countClientesAtivos(),
      this.countServicosAtivos(),
      this.listTransacoes(this.formatDate(monthStart), this.formatDate(today)),
      this.listTransacoes(this.formatDate(from30), this.formatDate(today)),
      this.listAtendimentosDesde(from30),
      this.listAtendimentosHoje(todayStart, tomorrowStart),
    ]);

    const receitaMesCentavos = transacoesMes
      .filter((transacao) => transacao.tipo === 'entrada')
      .reduce((total, transacao) => total + transacao.valor_centavos, 0);
    const saldo30DiasCentavos = transacoes30Dias.reduce((total, transacao) => {
      return total + (transacao.tipo === 'entrada' ? 1 : -1) * transacao.valor_centavos;
    }, 0);

    return {
      clientesAtivos,
      servicosAtivos,
      receitaMesCentavos,
      saldo30DiasCentavos,
      atendimentos30Dias: atendimentos30Dias.length,
      atendimentosHoje,
      stateCounts,
      daily: this.buildDailySeries(from30, today, transacoes30Dias, atendimentos30Dias),
    };
  }

  private async countStates(): Promise<DashboardStateCount[]> {
    const counts = await Promise.all(
      STATES.map(async (state) => ({
        state,
        label: ATENDIMENTO_STATE_LABEL[state],
        count: await this.countAtendimentos(state),
      })),
    );
    return counts;
  }

  private async countAtendimentos(state: AtendimentoState): Promise<number> {
    let query = this.supabase.from('atendimentos').select('id', { count: 'exact', head: true });
    query =
      state === 'em_andamento'
        ? query.in('state', ['aguardando_confirmacao', 'em_andamento'])
        : query.eq('state', state);

    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  private async countClientesAtivos(): Promise<number> {
    const { count, error } = await this.supabase
      .from('clientes')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  private async countServicosAtivos(): Promise<number> {
    const { count, error } = await this.supabase
      .from('servicos')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  private async listTransacoes(from: string, to: string): Promise<Transacao[]> {
    const { data, error } = await this.supabase
      .from('transacoes')
      .select('tipo, valor_centavos, data')
      .gte('data', from)
      .lte('data', to);
    if (error) throw new Error(error.message);
    return (data ?? []) as Transacao[];
  }

  private async listAtendimentosDesde(from: Date): Promise<AtendimentoDiaRow[]> {
    const { data, error } = await this.supabase
      .from('atendimentos')
      .select('created_at')
      .gte('created_at', from.toISOString());
    if (error) throw new Error(error.message);
    return (data ?? []) as AtendimentoDiaRow[];
  }

  private async listAtendimentosHoje(from: Date, to: Date): Promise<DashboardTodayAtendimento[]> {
    const { data, error } = await this.supabase
      .from('atendimentos')
      .select(
        `
          id, servico_id, servico_ids, descricao_solicitacao,
          state, created_at,
          cliente:clientes ( nome )
        `,
      )
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    return this.hydrateAtendimentosHoje((data ?? []) as unknown as AtendimentoHojeRow[]);
  }

  private async hydrateAtendimentosHoje(
    rows: readonly AtendimentoHojeRow[],
  ): Promise<DashboardTodayAtendimento[]> {
    const servicoIds = Array.from(
      new Set(
        rows.flatMap((row) => {
          const ids = row.servico_ids ?? [];
          return ids.length > 0 ? ids : row.servico_id ? [row.servico_id] : [];
        }),
      ),
    );
    const servicosById = await this.getServicosById(servicoIds);

    return rows.map((row) => {
      const rowServicoIds =
        row.servico_ids && row.servico_ids.length > 0
          ? row.servico_ids
          : row.servico_id
            ? [row.servico_id]
            : [];

      return {
        id: row.id,
        clienteNome: row.cliente?.nome ?? 'Cliente sem nome',
        servicos: rowServicoIds.flatMap((id) => {
          const servico = servicosById.get(id);
          return servico ? [servico] : [];
        }),
        descricaoSolicitacao: row.descricao_solicitacao,
        state: this.normalizeAtendimentoState(row.state),
        createdAt: row.created_at,
      };
    });
  }

  private async getServicosById(ids: readonly string[]): Promise<Map<string, DashboardServicoRef>> {
    if (ids.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('servicos')
      .select('id, nome, valor_centavos')
      .in('id', ids);
    if (error) throw new Error(error.message);

    return new Map(((data ?? []) as DashboardServicoRef[]).map((servico) => [servico.id, servico]));
  }

  private buildDailySeries(
    from: Date,
    to: Date,
    transacoes: readonly Transacao[],
    atendimentos: readonly AtendimentoDiaRow[],
  ): DashboardDailyPoint[] {
    const days = new Map<string, DashboardDailyPoint>();
    for (const day of this.daysBetween(from, to)) {
      const key = this.formatDate(day);
      days.set(key, {
        date: key,
        label: this.formatDayLabel(day),
        entradasCentavos: 0,
        saidasCentavos: 0,
        saldoCentavos: 0,
        atendimentos: 0,
      });
    }

    for (const transacao of transacoes) {
      const day = days.get(transacao.data);
      if (!day) continue;
      const entradasCentavos =
        day.entradasCentavos + (transacao.tipo === 'entrada' ? transacao.valor_centavos : 0);
      const saidasCentavos =
        day.saidasCentavos + (transacao.tipo === 'saida' ? transacao.valor_centavos : 0);
      days.set(transacao.data, {
        ...day,
        entradasCentavos,
        saidasCentavos,
        saldoCentavos: entradasCentavos - saidasCentavos,
      });
    }

    for (const atendimento of atendimentos) {
      const key = this.formatDate(new Date(atendimento.created_at));
      const day = days.get(key);
      if (!day) continue;
      days.set(key, { ...day, atendimentos: day.atendimentos + 1 });
    }

    return [...days.values()];
  }

  private daysBetween(from: Date, to: Date): Date[] {
    const days: Date[] = [];
    const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    while (cursor <= end) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  private addDays(date: Date, amount: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private normalizeAtendimentoState(state: AtendimentoState): AtendimentoState {
    return state === 'aguardando_confirmacao' ? 'em_andamento' : state;
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatDayLabel(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }).format(date);
  }
}
