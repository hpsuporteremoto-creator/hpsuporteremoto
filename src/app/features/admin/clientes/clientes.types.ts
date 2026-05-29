export interface OperadorRef {
  id: string;
  email: string;
  full_name: string | null;
}

export interface Cliente {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  observacao: string | null;
  cadastrado_por_user_id: string | null;
  cadastrado_por: OperadorRef | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClienteFormData {
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  observacao: string | null;
  ativo: boolean;
}
