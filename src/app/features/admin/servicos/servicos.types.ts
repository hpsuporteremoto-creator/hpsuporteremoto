export interface Servico {
  id: string;
  nome: string;
  categoria: string | null;
  valor_centavos: number;
  ativo: boolean;
  created_at: string;
}

export interface ServicoFormData {
  nome: string;
  categoria: string | null;
  valor_centavos: number;
  ativo: boolean;
}
