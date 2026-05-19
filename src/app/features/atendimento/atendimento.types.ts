export type AtendimentoState =
  | 'aguardando_confirmacao'
  | 'em_andamento'
  | 'pagamento'
  | 'concluido';

export const ATENDIMENTO_STATE_LABEL: Readonly<Record<AtendimentoState, string>> = {
  aguardando_confirmacao: 'Aguardando confirmação',
  em_andamento: 'Em andamento',
  pagamento: 'Pagamento',
  concluido: 'Concluído',
};

export interface Atendimento {
  id: string;
  cliente_id: string;
  servico_id: string | null;
  rustdesk_id: string;
  rustdesk_password: string;
  state: AtendimentoState;
  valor_centavos: number | null;
  pix_brcode: string | null;
  descricao_solicitacao: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClienteLookupResult {
  whatsapp: string;
  cliente_existe: boolean;
  ativo: boolean;
  nome: string | null;
  instagram: string | null;
  email: string | null;
}

export interface ConexaoFormData {
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  rustdesk_id: string;
  rustdesk_password: string;
  servico_id: string | null;
  descricao_solicitacao: string | null;
}

export const STORAGE_KEY = 'hp-atendimento-id' as const;
