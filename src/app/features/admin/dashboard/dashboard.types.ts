import { AtendimentoState } from '../atendimentos/atendimentos.types';

export interface DashboardStateCount {
  readonly state: AtendimentoState;
  readonly label: string;
  readonly count: number;
}

export interface DashboardDailyPoint {
  readonly date: string;
  readonly label: string;
  readonly entradasCentavos: number;
  readonly saidasCentavos: number;
  readonly saldoCentavos: number;
  readonly atendimentos: number;
}

export interface AdminDashboardData {
  readonly clientesAtivos: number;
  readonly servicosAtivos: number;
  readonly receitaMesCentavos: number;
  readonly saldo30DiasCentavos: number;
  readonly atendimentos30Dias: number;
  readonly stateCounts: DashboardStateCount[];
  readonly daily: DashboardDailyPoint[];
}
