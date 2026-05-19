import {
  Atendimento,
  AtendimentoState,
  ATENDIMENTO_STATE_LABEL,
} from '../../atendimento/atendimento.types';

export type { Atendimento, AtendimentoState };
export { ATENDIMENTO_STATE_LABEL };

export interface AtendimentoClienteRef {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
}

export interface AtendimentoServicoRef {
  id: string;
  nome: string;
  valor_centavos: number;
}

export interface AtendimentoComRelacoes extends Atendimento {
  cliente: AtendimentoClienteRef;
  servico: AtendimentoServicoRef | null;
}

export type AtendimentoListFilter =
  | 'em-andamento'
  | 'faturamento'
  | 'pagamento'
  | 'concluido';
