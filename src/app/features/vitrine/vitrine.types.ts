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

export type MeuPedidoState =
  | 'aguardando_confirmacao'
  | 'recusado'
  | 'em_andamento'
  | 'pagamento'
  | 'concluido';

export interface MeuPedidoServico {
  id: string;
  nome: string;
  valor_centavos: number;
}

export interface MeuPedidoCliente {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
}

export interface MeuPedido {
  id: string;
  cliente_id: string;
  servico_id: string | null;
  servico_ids: string[] | null;
  desconto_centavos: number;
  state: MeuPedidoState;
  valor_centavos: number | null;
  pix_brcode: string | null;
  descricao_solicitacao: string | null;
  created_at: string;
  updated_at: string;
  cliente: MeuPedidoCliente;
  servico: MeuPedidoServico | null;
  servicos_solicitados: MeuPedidoServico[];
}
