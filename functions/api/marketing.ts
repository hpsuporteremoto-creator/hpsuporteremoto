import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { requireAdmin } from './admin-auth';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY?: string;
};

type Context = { request: Request; env: Env };

type ClienteMarketingRow = {
  id: string;
  nome: string;
  email: string | null;
  whatsapp: string;
  marketing_opt_in: boolean;
  marketing_opt_out_at: string | null;
  resend_contact_id: string | null;
};

type AtendimentoClienteRow = { cliente_id: string };

type AudienceRecipient = {
  id: string;
  nome: string;
  email: string;
  whatsapp: string;
  resend_contact_id: string | null;
};

type MarketingCampaignRow = {
  id: string;
  nome: string;
  assunto: string;
  mensagem: string;
  texto_previa: string | null;
  servico_id: string | null;
  somente_vendas_contabilizadas: boolean;
  status: CampaignStatus;
  total_destinatarios: number;
  agendada_para: string | null;
  enviada_em: string | null;
  resend_segment_id: string | null;
  resend_broadcast_id: string | null;
  erro: string | null;
  criado_por_user_id: string | null;
  created_at: string;
  updated_at: string;
  servico?: { id: string; nome: string } | null;
  criado_por?: { id: string; email: string; full_name: string | null } | null;
};

type CampaignStatus = 'rascunho' | 'agendada' | 'enviada' | 'falhou' | 'cancelada';

type CampaignInput = {
  nome: string;
  assunto: string;
  mensagem: string;
  texto_previa: string | null;
  servico_id: string | null;
  somente_vendas_contabilizadas: boolean;
  agendada_para: string | null;
};

const DEFAULT_SENDER = 'HP Suporte <contato@hpsuporteremoto.com.br>';
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PAGE_SIZE = 1000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestGet = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createAdminClient(env);
  if (!admin) return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'overview';
  const servicoId = normalizeUuid(url.searchParams.get('servicoId'));
  const somenteContabilizados = url.searchParams.get('somenteContabilizados') !== 'false';

  try {
    const audience = await resolveAudience(admin, servicoId, somenteContabilizados);

    if (action === 'download') {
      const field = url.searchParams.get('field');
      if (field !== 'emails' && field !== 'whatsapps') {
        return json({ error: 'Campo de exportação inválido' }, 400);
      }
      return csvDownload(audience, field);
    }

    if (action === 'audience') {
      return json(audienceResponse(audience), 200);
    }

    if (action === 'campaigns') {
      return json({ campanhas: await listCampaigns(admin) }, 200);
    }

    if (action !== 'overview') return json({ error: 'Ação inválida' }, 400);

    const campanhas = await listCampaigns(admin);
    return json(
      {
        ...audienceResponse(audience),
        campanhas,
        remetente: DEFAULT_SENDER,
        resendConfigurado: Boolean(env.RESEND_API_KEY),
      },
      200,
    );
  } catch (err) {
    return json({ error: errorMessage(err, 'Erro ao carregar marketing') }, 500);
  }
};

export const onRequestPost = async (context: Context): Promise<Response> => {
  const { request, env } = context;
  const admin = createAdminClient(env);
  if (!admin) return json({ error: 'Servidor mal configurado (env vars ausentes)' }, 500);

  const adminCheck = await requireAdmin(admin, request);
  if (!adminCheck.ok) return json({ error: adminCheck.error }, adminCheck.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corpo JSON inválido' }, 400);
  }

  const record = toRecord(body);
  const action = typeof record['action'] === 'string' ? record['action'] : '';

  if (action === 'test') {
    return sendTestEmail(env, record);
  }
  if (action === 'create') {
    return createCampaign(admin, env, adminCheck.user.id, record);
  }
  return json({ error: 'Ação inválida' }, 400);
};

function createAdminClient(env: Env): SupabaseClient | null {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendTestEmail(env: Env, record: Record<string, unknown>): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não foi configurada no Cloudflare Pages.' }, 503);
  }
  const email = normalizeEmail(record['email']);
  const assunto = normalizeText(record['assunto'], 3, 180);
  const mensagem = normalizeText(record['mensagem'], 3, 20_000);
  if (!email || !assunto || !mensagem) {
    return json({ error: 'Informe email, assunto e mensagem para o teste.' }, 400);
  }

  const resend = new Resend(env.RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from: DEFAULT_SENDER,
    to: [email],
    subject: `[Teste] ${assunto}`,
    html: renderCampaignHtml(mensagem, false),
    text: renderCampaignText(mensagem, false),
  });
  if (error) return json({ error: error.message }, 502);
  return json({ id: data?.id ?? null, message: 'Email de teste enviado.' }, 201);
}

async function createCampaign(
  admin: SupabaseClient,
  env: Env,
  userId: string,
  record: Record<string, unknown>,
): Promise<Response> {
  if (!env.RESEND_API_KEY) {
    return json({ error: 'RESEND_API_KEY não foi configurada no Cloudflare Pages.' }, 503);
  }
  const input = parseCampaignInput(record);
  if (!input) return json({ error: 'Dados da campanha inválidos.' }, 400);

  try {
    const recipients = await resolveAudience(
      admin,
      input.servico_id,
      input.somente_vendas_contabilizadas,
    );
    if (recipients.length === 0) {
      return json({ error: 'Nenhum cliente com email e consentimento foi encontrado para este público.' }, 400);
    }

    const { data: campaign, error: campaignError } = await admin
      .from('marketing_campanhas')
      .insert({
        ...input,
        status: 'rascunho',
        total_destinatarios: recipients.length,
        criado_por_user_id: userId,
      })
      .select('*')
      .single<MarketingCampaignRow>();
    if (campaignError || !campaign) throw new Error(campaignError?.message ?? 'Falha ao criar campanha');

    try {
      await insertRecipients(admin, campaign.id, recipients);
      const resend = new Resend(env.RESEND_API_KEY);
      const segmentResult = await resend.segments.create({
        name: `${safeSegmentName(input.nome)} ${campaign.id.slice(0, 8)}`,
      });
      if (segmentResult.error || !segmentResult.data) {
        throw new Error(segmentResult.error?.message ?? 'Falha ao criar segmento no Resend');
      }

      const deliverable = await syncRecipientsToSegment(
        admin,
        resend,
        campaign.id,
        segmentResult.data.id,
        recipients,
      );
      if (deliverable === 0) {
        throw new Error('Nenhum destinatário pôde ser sincronizado com o Resend.');
      }

      const broadcastResult = input.agendada_para
        ? await resend.broadcasts.create({
            name: input.nome,
            segmentId: segmentResult.data.id,
            from: DEFAULT_SENDER,
            subject: input.assunto,
            previewText: input.texto_previa ?? undefined,
            html: renderCampaignHtml(input.mensagem, true),
            text: renderCampaignText(input.mensagem, true),
            send: true,
            scheduledAt: input.agendada_para,
          })
        : await resend.broadcasts.create({
            name: input.nome,
            segmentId: segmentResult.data.id,
            from: DEFAULT_SENDER,
            subject: input.assunto,
            previewText: input.texto_previa ?? undefined,
            html: renderCampaignHtml(input.mensagem, true),
            text: renderCampaignText(input.mensagem, true),
            send: true,
          });
      if (broadcastResult.error || !broadcastResult.data) {
        throw new Error(broadcastResult.error?.message ?? 'Falha ao enviar campanha pelo Resend');
      }

      const status: CampaignStatus = input.agendada_para ? 'agendada' : 'enviada';
      const recipientStatus = input.agendada_para ? 'agendado' : 'enviado';
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from('marketing_campanhas')
        .update({
          status,
          resend_segment_id: segmentResult.data.id,
          resend_broadcast_id: broadcastResult.data.id,
          enviada_em: input.agendada_para ? null : now,
          erro: null,
        })
        .eq('id', campaign.id);
      if (updateError) throw new Error(updateError.message);

      const { error: recipientsUpdateError } = await admin
        .from('marketing_campanha_destinatarios')
        .update({ status: recipientStatus })
        .eq('campanha_id', campaign.id)
        .eq('status', 'pendente');
      if (recipientsUpdateError) throw new Error(recipientsUpdateError.message);

      await admin.from('marketing_eventos').insert({
        campanha_id: campaign.id,
        tipo: input.agendada_para ? 'broadcast.agendado' : 'broadcast.enviado',
        payload: {
          resend_broadcast_id: broadcastResult.data.id,
          resend_segment_id: segmentResult.data.id,
          destinatarios: deliverable,
        },
      });

      return json(
        {
          campanha: {
            ...campaign,
            status,
            resend_segment_id: segmentResult.data.id,
            resend_broadcast_id: broadcastResult.data.id,
            enviada_em: input.agendada_para ? null : now,
          },
          message: input.agendada_para ? 'Campanha agendada.' : 'Campanha enviada.',
        },
        201,
      );
    } catch (err) {
      await admin
        .from('marketing_campanhas')
        .update({ status: 'falhou', erro: errorMessage(err, 'Falha ao enviar campanha') })
        .eq('id', campaign.id);
      return json({ error: errorMessage(err, 'Falha ao enviar campanha'), campanhaId: campaign.id }, 502);
    }
  } catch (err) {
    return json({ error: errorMessage(err, 'Falha ao criar campanha') }, 500);
  }
}

async function insertRecipients(
  admin: SupabaseClient,
  campaignId: string,
  recipients: readonly AudienceRecipient[],
): Promise<void> {
  const rows = recipients.map((recipient) => ({
    campanha_id: campaignId,
    cliente_id: recipient.id,
    nome: recipient.nome,
    email: recipient.email,
    whatsapp: recipient.whatsapp || null,
    resend_contact_id: recipient.resend_contact_id,
  }));
  for (let index = 0; index < rows.length; index += PAGE_SIZE) {
    const { error } = await admin
      .from('marketing_campanha_destinatarios')
      .insert(rows.slice(index, index + PAGE_SIZE));
    if (error) throw new Error(error.message);
  }
}

async function syncRecipientsToSegment(
  admin: SupabaseClient,
  resend: Resend,
  campaignId: string,
  segmentId: string,
  recipients: readonly AudienceRecipient[],
): Promise<number> {
  let deliverable = 0;
  for (const recipient of recipients) {
    try {
      const contact = await ensureResendContact(resend, recipient);
      if (contact.unsubscribed) {
        await markRecipient(admin, campaignId, recipient, 'descadastrado');
        await admin
          .from('clientes')
          .update({ marketing_opt_in: false, marketing_opt_out_at: new Date().toISOString() })
          .eq('id', recipient.id);
        continue;
      }

      const membership = await resend.contacts.segments.add({
        contactId: contact.id,
        segmentId,
      });
      if (membership.error) throw new Error(membership.error.message);

      await markRecipient(admin, campaignId, recipient, 'pendente', null, contact.id);
      await admin.from('clientes').update({ resend_contact_id: contact.id }).eq('id', recipient.id);
      deliverable += 1;
    } catch (err) {
      await markRecipient(admin, campaignId, recipient, 'falhou', errorMessage(err, 'Falha no Resend'));
    }
  }
  return deliverable;
}

async function ensureResendContact(
  resend: Resend,
  recipient: AudienceRecipient,
): Promise<{ id: string; unsubscribed: boolean }> {
  const current = recipient.resend_contact_id
    ? await resend.contacts.get({ id: recipient.resend_contact_id })
    : await resend.contacts.get({ email: recipient.email });
  if (current.data) {
    return { id: current.data.id, unsubscribed: current.data.unsubscribed };
  }

  const created = await resend.contacts.create({
    email: recipient.email,
    firstName: firstName(recipient.nome),
    properties: { CLIENTE_ID: recipient.id },
  });
  if (created.data) return { id: created.data.id, unsubscribed: false };

  const retried = await resend.contacts.get({ email: recipient.email });
  if (retried.data) return { id: retried.data.id, unsubscribed: retried.data.unsubscribed };
  throw new Error(created.error?.message ?? retried.error?.message ?? 'Contato não pôde ser criado');
}

async function markRecipient(
  admin: SupabaseClient,
  campaignId: string,
  recipient: AudienceRecipient,
  status: string,
  erro: string | null = null,
  resendContactId: string | null = null,
): Promise<void> {
  const patch: Record<string, unknown> = { status, erro };
  if (resendContactId) patch['resend_contact_id'] = resendContactId;
  const { error } = await admin
    .from('marketing_campanha_destinatarios')
    .update(patch)
    .eq('campanha_id', campaignId)
    .eq('email', recipient.email);
  if (error) throw new Error(error.message);
}

async function resolveAudience(
  admin: SupabaseClient,
  servicoId: string | null,
  somenteContabilizados: boolean,
): Promise<AudienceRecipient[]> {
  const purchasedIds = servicoId
    ? await listPurchasedClientIds(admin, servicoId, somenteContabilizados)
    : null;
  if (purchasedIds && purchasedIds.size === 0) return [];

  const clients = await listMarketingClients(admin);
  const byEmail = new Map<string, AudienceRecipient>();
  for (const client of clients) {
    if (!client.marketing_opt_in || client.marketing_opt_out_at || !client.email) continue;
    if (purchasedIds && !purchasedIds.has(client.id)) continue;
    const email = normalizeEmail(client.email);
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      id: client.id,
      nome: client.nome,
      email,
      whatsapp: client.whatsapp,
      resend_contact_id: client.resend_contact_id,
    });
  }
  return [...byEmail.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

async function listMarketingClients(admin: SupabaseClient): Promise<ClienteMarketingRow[]> {
  const rows: ClienteMarketingRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('clientes')
      .select('id, nome, email, whatsapp, marketing_opt_in, marketing_opt_out_at, resend_contact_id')
      .eq('ativo', true)
      .eq('marketing_opt_in', true)
      .is('marketing_opt_out_at', null)
      .not('email', 'is', null)
      .order('nome', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ClienteMarketingRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function listPurchasedClientIds(
  admin: SupabaseClient,
  servicoId: string,
  somenteContabilizados: boolean,
): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = admin
      .from('atendimentos')
      .select(somenteContabilizados ? 'cliente_id, transacoes!inner(id)' : 'cliente_id')
      .eq('state', 'concluido')
      .contains('servico_ids', [servicoId])
      .range(from, from + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as AtendimentoClienteRow[];
    for (const row of page) ids.add(row.cliente_id);
    if (page.length < PAGE_SIZE) return ids;
  }
}

async function listCampaigns(admin: SupabaseClient): Promise<MarketingCampaignRow[]> {
  const { data, error } = await admin
    .from('marketing_campanhas')
    .select(
      `
        id, nome, assunto, mensagem, texto_previa, servico_id,
        somente_vendas_contabilizadas, status, total_destinatarios,
        agendada_para, enviada_em, resend_segment_id, resend_broadcast_id,
        erro, criado_por_user_id, created_at, updated_at,
        servico:servicos ( id, nome ),
        criado_por:profiles ( id, email, full_name )
      `,
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MarketingCampaignRow[];
}

function audienceResponse(audience: readonly AudienceRecipient[]): Record<string, unknown> {
  const whatsapp = Array.from(
    new Set(audience.map((recipient) => recipient.whatsapp).filter((value) => value.length > 0)),
  );
  return {
    destinatarios: audience,
    total: audience.length,
    totalEmails: audience.length,
    totalWhatsapps: whatsapp.length,
  };
}

function csvDownload(audience: readonly AudienceRecipient[], field: 'emails' | 'whatsapps'): Response {
  const rows =
    field === 'emails'
      ? [['Nome', 'Email'], ...audience.map((recipient) => [recipient.nome, recipient.email])]
      : [
          ['Nome', 'WhatsApp'],
          ...audience
            .filter((recipient) => recipient.whatsapp.length > 0)
            .map((recipient) => [recipient.nome, `+${recipient.whatsapp}`]),
        ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsv).join(';')).join('\r\n')}\r\n`;
  const filename = field === 'emails' ? 'emails-marketing.csv' : 'whatsapps-marketing.csv';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function parseCampaignInput(record: Record<string, unknown>): CampaignInput | null {
  const nome = normalizeText(record['nome'], 3, 120);
  const assunto = normalizeText(record['assunto'], 3, 180);
  const mensagem = normalizeText(record['mensagem'], 3, 20_000);
  const textoPrevia = normalizeOptionalText(record['texto_previa'], 180);
  const servicoId = normalizeUuid(record['servico_id']);
  const somenteContabilizados = record['somente_vendas_contabilizadas'] !== false;
  const agendadaPara = normalizeSchedule(record['agendada_para']);
  if (!nome || !assunto || !mensagem) return null;
  if (record['agendada_para'] !== null && record['agendada_para'] !== undefined && !agendadaPara) {
    return null;
  }
  return {
    nome,
    assunto,
    mensagem,
    texto_previa: textoPrevia,
    servico_id: servicoId,
    somente_vendas_contabilizadas: somenteContabilizados,
    agendada_para: agendadaPara,
  };
}

function normalizeSchedule(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now() + 60_000) return null;
  return date.toISOString();
}

function normalizeText(value: unknown, minLength: number, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length >= minLength && text.length <= maxLength ? text : null;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return EMAIL_REGEX.test(email) ? email : null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  )
    ? value.trim()
    : null;
}

function renderCampaignHtml(message: string, includeUnsubscribe: boolean): string {
  const paragraphs = message
    .split(/\r?\n\s*\r?\n/g)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, '<br>')}</p>`)
    .join('');
  const unsubscribe = includeUnsubscribe
    ? '<p style="margin-top:32px;font-size:12px;color:#64748b">Não quer mais receber estas mensagens? <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Cancelar inscrição</a></p>'
    : '';
  return `<main style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:640px;margin:0 auto;padding:24px">${paragraphs}${unsubscribe}</main>`;
}

function renderCampaignText(message: string, includeUnsubscribe: boolean): string {
  return includeUnsubscribe
    ? `${message}\n\nNão quer mais receber estas mensagens? {{{RESEND_UNSUBSCRIBE_URL}}}`
    : message;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeCsv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function firstName(value: string): string {
  return value.trim().split(/\s+/)[0] || 'Cliente';
}

function safeSegmentName(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 90);
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
