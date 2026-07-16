import { AtendimentoState } from '../atendimentos/atendimentos.types';

export interface DashboardServicoRef {
  readonly id: string;
  readonly nome: string;
  readonly valor_centavos: number;
  readonly quantidade: number;
  readonly subtotal_centavos: number;
}

export interface DashboardTodayAtendimento {
  readonly id: string;
  readonly clienteNome: string;
  readonly servicos: DashboardServicoRef[];
  readonly descontoCentavos: number;
  readonly acrescimoCentavos: number;
  readonly valorCentavos: number;
  readonly descricaoSolicitacao: string | null;
  readonly state: AtendimentoState;
  readonly createdAt: string;
}

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

export interface DashboardTopServico {
  readonly id: string;
  readonly nome: string;
  readonly quantidade: number;
  readonly pedidos: number;
}

export interface DashboardTopCliente {
  readonly id: string;
  readonly nome: string;
  readonly pedidos: number;
  readonly valorCentavos: number;
}

export interface AdminDashboardData {
  readonly clientesAtivos: number;
  readonly servicosAtivos: number;
  readonly receitaHojeCentavos: number;
  readonly receitaMesCentavos: number;
  readonly saldo30DiasCentavos: number;
  readonly atendimentos30Dias: number;
  readonly atendimentosHoje: DashboardTodayAtendimento[];
  readonly stateCounts: DashboardStateCount[];
  readonly daily: DashboardDailyPoint[];
  readonly servicosMaisVendidos: DashboardTopServico[];
  readonly clientesQueMaisCompram: DashboardTopCliente[];
}
