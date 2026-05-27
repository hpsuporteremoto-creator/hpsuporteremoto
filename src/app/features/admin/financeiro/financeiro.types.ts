export type TransacaoTipo = 'entrada' | 'saida';

export interface TransacaoClienteRef {
  id: string;
  nome: string;
}

export interface TransacaoAtendimentoRef {
  id: string;
  cliente: TransacaoClienteRef | null;
}

export interface Transacao {
  id: string;
  tipo: TransacaoTipo;
  valor_centavos: number;
  descricao: string;
  atendimento_id: string | null;
  atendimento?: TransacaoAtendimentoRef | null;
  data: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface TransacaoFormData {
  tipo: TransacaoTipo;
  valor_centavos: number;
  descricao: string;
  data: string; // YYYY-MM-DD
  atendimento_id: string | null;
}

export interface ResumoFinanceiro {
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface PixRecebedorConfig {
  id: number;
  pix_key: string;
  receiver_name: string;
  receiver_city: string;
  created_at: string;
  updated_at: string;
}

export interface PixRecebedorConfigFormData {
  pix_key: string;
  receiver_name: string;
  receiver_city: string;
}
