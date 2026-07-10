import { createClient } from '@supabase/supabase-js';
import { Resend, type WebhookEventPayload } from 'resend';

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;
};

type Context = { request: Request; env: Env };

type MarketingEmailWebhookEvent = Exclude<
  WebhookEventPayload,
  | { type: 'email.received' }
  | { type: 'contact.created' }
  | { type: 'contact.updated' }
  | { type: 'contact.deleted' }
  | { type: 'domain.created' }
  | { type: 'domain.updated' }
  | { type: 'domain.deleted' }
>;

const RECIPIENT_STATUS: Readonly<Record<string, string>> = {
  'email.scheduled': 'agendado',
  'email.sent': 'enviado',
  'email.delivered': 'entregue',
  'email.opened': 'aberto',
  'email.clicked': 'clicado',
  'email.bounced': 'falhou',
  'email.failed': 'falhou',
  'email.suppressed': 'falhou',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost = async ({ request, env }: Context): Promise<Response> => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) {
    return json({ error: 'Servidor mal configurado' }, 500);
  }
  if (!env.RESEND_WEBHOOK_SECRET) {
    return json({ error: 'Webhook não configurado' }, 503);
  }

  const payload = await request.text();
  const id = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!id || !timestamp || !signature) return json({ error: 'Assinatura ausente' }, 400);

  let event: WebhookEventPayload;
  try {
    event = new Resend(env.RESEND_API_KEY).webhooks.verify({
      payload,
      webhookSecret: env.RESEND_WEBHOOK_SECRET,
      headers: { id, timestamp, signature },
    });
  } catch {
    return json({ error: 'Assinatura inválida' }, 400);
  }

  const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (event.type === 'contact.updated' && event.data.unsubscribed) {
      await admin
        .from('clientes')
        .update({ marketing_opt_in: false, marketing_opt_out_at: new Date().toISOString() })
        .ilike('email', event.data.email);
      return json({ ok: true });
    }

    if (!isMarketingEmailEvent(event)) return json({ ok: true });
    const broadcastId = event.data.broadcast_id;
    const email = event.data.to[0]?.trim().toLowerCase();
    if (!broadcastId || !email) return json({ ok: true });

    const { data: campaign, error: campaignError } = await admin
      .from('marketing_campanhas')
      .select('id')
      .eq('resend_broadcast_id', broadcastId)
      .maybeSingle<{ id: string }>();
    if (campaignError) throw new Error(campaignError.message);
    if (!campaign) return json({ ok: true });

    const status = RECIPIENT_STATUS[event.type];
    if (status) {
      const { error } = await admin
        .from('marketing_campanha_destinatarios')
        .update({ status })
        .eq('campanha_id', campaign.id)
        .ilike('email', email);
      if (error) throw new Error(error.message);
    }

    const { error: eventError } = await admin.from('marketing_eventos').insert({
      campanha_id: campaign.id,
      tipo: event.type,
      resend_email_id: event.data.email_id,
      payload: event,
    });
    if (eventError) throw new Error(eventError.message);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao processar webhook' }, 500);
  }
};

function isMarketingEmailEvent(event: WebhookEventPayload): event is MarketingEmailWebhookEvent {
  return event.type.startsWith('email.') && event.type !== 'email.received';
}
