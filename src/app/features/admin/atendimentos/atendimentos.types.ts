import { Atendimento, AtendimentoState } from '../../atendimento/atendimento.types';

export type { Atendimento, AtendimentoState };

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
  | 'liquidacao'
  | 'finalizado';
