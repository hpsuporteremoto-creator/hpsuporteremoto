export type TransacaoTipo = 'entrada' | 'saida';

export interface Transacao {
  id: string;
  tipo: TransacaoTipo;
  valor_centavos: number;
  descricao: string;
  atendimento_id: string | null;
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
