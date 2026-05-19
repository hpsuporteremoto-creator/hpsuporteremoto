export interface Cliente {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClienteFormData {
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  ativo: boolean;
}
