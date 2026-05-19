export interface Servico {
  id: string;
  nome: string;
  valor_centavos: number;
  ativo: boolean;
  created_at: string;
}

export interface ServicoFormData {
  nome: string;
  valor_centavos: number;
  ativo: boolean;
}
