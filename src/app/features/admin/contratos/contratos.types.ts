export type ContratoStatus = 'a_iniciar' | 'em_andamento' | 'finalizado' | 'cancelado';

export const CONTRATO_STATUS_OPTIONS: ReadonlyArray<{
  readonly value: ContratoStatus;
  readonly label: string;
}> = [
  { value: 'a_iniciar', label: 'A Iniciar' },
  { value: 'em_andamento', label: 'Em Andamento' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' },
];

export interface ContratoClienteRef {
  id: string;
  nome: string;
  whatsapp: string;
  email: string | null;
}

export interface Contrato {
  id: string;
  cliente_id: string;
  cliente: ContratoClienteRef;
  status: ContratoStatus;
  objeto: string;
  condicoes: string | null;
  observacoes: string | null;
  criado_por_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContratoFormData {
  cliente_id: string;
  status: ContratoStatus;
  objeto: string;
  condicoes: string | null;
  observacoes: string | null;
}

export function toContratoStatusLabel(status: ContratoStatus): string {
  return CONTRATO_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? 'A Iniciar';
}
