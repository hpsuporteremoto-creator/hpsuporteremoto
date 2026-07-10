export type MarketingCampaignStatus = 'rascunho' | 'agendada' | 'enviada' | 'falhou' | 'cancelada';

export interface MarketingDestinatario {
  id: string;
  nome: string;
  email: string;
  whatsapp: string;
  resend_contact_id: string | null;
}

export interface MarketingCampaign {
  id: string;
  nome: string;
  assunto: string;
  mensagem: string;
  texto_previa: string | null;
  servico_id: string | null;
  somente_vendas_contabilizadas: boolean;
  status: MarketingCampaignStatus;
  total_destinatarios: number;
  agendada_para: string | null;
  enviada_em: string | null;
  resend_segment_id: string | null;
  resend_broadcast_id: string | null;
  erro: string | null;
  criado_por_user_id: string | null;
  created_at: string;
  updated_at: string;
  servico: { id: string; nome: string } | null;
  criado_por: { id: string; email: string; full_name: string | null } | null;
}

export interface MarketingOverview {
  destinatarios: MarketingDestinatario[];
  total: number;
  totalEmails: number;
  totalWhatsapps: number;
  campanhas: MarketingCampaign[];
  remetente: string;
  resendConfigurado: boolean;
}

export interface MarketingAudience {
  destinatarios: MarketingDestinatario[];
  total: number;
  totalEmails: number;
  totalWhatsapps: number;
}

export interface MarketingCampaignInput {
  nome: string;
  assunto: string;
  mensagem: string;
  texto_previa: string | null;
  servico_id: string | null;
  somente_vendas_contabilizadas: boolean;
  agendada_para: string | null;
}
