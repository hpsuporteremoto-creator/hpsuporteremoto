export type AtendimentoState =
  | 'aguardando_confirmacao'
  | 'recusado'
  | 'em_andamento'
  | 'pagamento'
  | 'concluido';

export const ATENDIMENTO_STATE_LABEL: Readonly<Record<AtendimentoState, string>> = {
  aguardando_confirmacao: 'Em andamento',
  recusado: 'Recusado',
  em_andamento: 'Em andamento',
  pagamento: 'Pagamento',
  concluido: 'Concluído',
};

export interface Atendimento {
  id: string;
  cliente_id: string;
  servico_id: string | null;
  servico_ids: string[] | null;
  desconto_centavos: number;
  state: AtendimentoState;
  valor_centavos: number | null;
  pix_brcode: string | null;
  descricao_solicitacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface CriarAtendimentoParaClienteData {
  servico_itens: AtendimentoServicoInput[];
  desconto_centavos: number;
  descricao_solicitacao: string | null;
}

export interface AtualizarAtendimentoEmAndamentoData {
  servico_itens: AtendimentoServicoInput[];
  desconto_centavos: number;
  descricao_solicitacao: string | null;
}

export interface AtendimentoServicoInput {
  servico_id: string;
  quantidade: number;
}

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
  quantidade: number;
  subtotal_centavos: number;
}

export interface AtendimentoComRelacoes extends Atendimento {
  cliente: AtendimentoClienteRef;
  servico: AtendimentoServicoRef | null;
  servicos_solicitados: AtendimentoServicoRef[];
}

export type AtendimentoListFilter = 'em_andamento' | 'pagamento' | 'concluido' | 'recusado';

export interface AtendimentoListOptions {
  clienteId?: string;
  todosOsStatus?: boolean;
}
