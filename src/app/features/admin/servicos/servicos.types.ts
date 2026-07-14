export interface ServicoCategoria {
  id: string;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServicoCategoriaFormData {
  nome: string;
  descricao: string | null;
  ativo: boolean;
}

export type ServicoCategoriaRef = Pick<
  ServicoCategoria,
  'id' | 'nome' | 'descricao' | 'ativo'
>;

export interface Servico {
  id: string;
  nome: string;
  categoria_id: string | null;
  categoria: ServicoCategoriaRef | null;
  descricao: string | null;
  imagem_url: string | null;
  valor_centavos: number;
  ativo: boolean;
  vitrine: boolean;
  created_at: string;
}

export interface ServicoFormData {
  nome: string;
  categoria_id: string | null;
  descricao: string | null;
  imagem_url: string | null;
  valor_centavos: number;
  ativo: boolean;
  vitrine: boolean;
}

export interface ServicosCounts {
  ativos: number;
  inativos: number;
}

export interface ServicosListQuery {
  ativo: boolean;
  pageIndex: number;
  pageSize: number;
  termo?: string;
  categoriaId?: string | null;
}

export interface ServicosListResult {
  servicos: Servico[];
  total: number;
  counts: ServicosCounts;
}
