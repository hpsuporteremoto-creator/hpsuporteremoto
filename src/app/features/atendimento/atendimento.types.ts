export type AtendimentoState =
  | 'aguardando_confirmacao'
  | 'recusado'
  | 'em_andamento'
  | 'pagamento'
  | 'concluido';

export const ATENDIMENTO_STATE_LABEL: Readonly<Record<AtendimentoState, string>> = {
  aguardando_confirmacao: 'Aguardando confirmação',
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
  rustdesk_id: string | null;
  rustdesk_password: string | null;
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
  servico_id: string | null;
  servico_ids: string[];
  descricao_solicitacao: string | null;
}

export interface CredenciaisRustDeskData {
  rustdesk_id: string | null;
  rustdesk_password: string | null;
}

export type CriarAtendimentoData = ConexaoFormData & CredenciaisRustDeskData;

export const STORAGE_KEY = 'hp-atendimento-id' as const;
export const DRAFT_STORAGE_KEY = 'hp-atendimento-draft' as const;
