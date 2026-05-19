export type AtendimentoState =
  | 'conexao'
  | 'em_atendimento'
  | 'liquidacao'
  | 'finalizado';

export interface Atendimento {
  id: string;
  cliente_id: string;
  servico_id: string | null;
  rustdesk_id: string;
  rustdesk_password: string;
  state: AtendimentoState;
  valor_centavos: number | null;
  pix_brcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConexaoFormData {
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  rustdesk_id: string;
  rustdesk_password: string;
}

export const STORAGE_KEY = 'hp-atendimento-id' as const;
