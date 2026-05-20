import {
  Atendimento,
  AtendimentoState,
  ATENDIMENTO_STATE_LABEL,
  CriarAtendimentoData,
} from '../../atendimento/atendimento.types';

export type { Atendimento, AtendimentoState, CriarAtendimentoData };
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
  servicos_solicitados: AtendimentoServicoRef[];
}

export type AtendimentoListFilter =
  | 'novos'
  | 'em_andamento'
  | 'pagamento'
  | 'concluido'
  | 'recusado';
