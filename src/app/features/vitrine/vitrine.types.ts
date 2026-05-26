import { ServicoCategoriaRef } from '../admin/servicos/servicos.types';

export interface VitrineServico {
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

export interface ServicoComentario {
  id: string;
  servico_id: string;
  parent_id: string | null;
  user_id: string;
  author_name: string;
  author_email: string | null;
  author_avatar_url: string | null;
  texto: string;
  created_at: string;
  updated_at: string;
}

export interface ServicoComentarioThread extends ServicoComentario {
  respostas: ServicoComentario[];
}
