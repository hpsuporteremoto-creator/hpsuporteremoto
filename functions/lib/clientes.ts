import { clientes } from '../../drizzle/schema';

export type ClienteCadastroRef = {
  id: string;
  email: string;
  full_name: string | null;
};

export type ClienteResponse = {
  id: string;
  nome: string;
  whatsapp: string;
  instagram: string | null;
  email: string | null;
  observacao: string | null;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
  marketing_opt_out_at: string | null;
  cadastrado_por_user_id: string | null;
  cadastrado_por: ClienteCadastroRef | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export function toClienteResponse(
  cliente: typeof clientes.$inferSelect,
  cadastradoPor: ClienteCadastroRef | null = null,
): ClienteResponse {
  return {
    id: cliente.id,
    nome: cliente.nome,
    whatsapp: cliente.whatsapp,
    instagram: cliente.instagram,
    email: cliente.email,
    observacao: cliente.observacao,
    marketing_opt_in: cliente.marketingOptIn,
    marketing_opt_in_at: cliente.marketingOptInAt,
    marketing_opt_out_at: cliente.marketingOptOutAt,
    cadastrado_por_user_id: cliente.cadastradoPorUserId,
    cadastrado_por: cadastradoPor,
    ativo: cliente.ativo,
    created_at: cliente.createdAt,
    updated_at: cliente.updatedAt,
  };
}
