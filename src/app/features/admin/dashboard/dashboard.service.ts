import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoState,
} from '../atendimentos/atendimentos.types';
import { Transacao } from '../financeiro/financeiro.types';
import {
  AdminDashboardData,
  DashboardDailyPoint,
  DashboardStateCount,
} from './dashboard.types';

interface AtendimentoDiaRow {
  readonly created_at: string;
}

const STATES: readonly AtendimentoState[] = [
  'aguardando_confirmacao',
  'em_andamento',
  'pagamento',
  'concluido',
  'recusado',
];

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SupabaseService).client;

  async load(): Promise<AdminDashboardData> {
    const today = new Date();
    const from30 = this.addDays(today, -29);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      stateCounts,
      clientesAtivos,
      servicosAtivos,
      transacoesMes,
      transacoes30Dias,
      atendimentos30Dias,
    ] = await Promise.all([
      this.countStates(),
      this.countClientesAtivos(),
      this.countServicosAtivos(),
      this.listTransacoes(this.formatDate(monthStart), this.formatDate(today)),
      this.listTransacoes(this.formatDate(from30), this.formatDate(today)),
      this.listAtendimentosDesde(from30),
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
    const { count, error } = await this.supabase
      .from('atendimentos')
      .select('id', { count: 'exact', head: true })
      .eq('state', state);
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
