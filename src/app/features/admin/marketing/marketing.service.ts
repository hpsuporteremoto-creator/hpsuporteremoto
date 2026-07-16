import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  MarketingAudience,
  MarketingCampaign,
  MarketingCampaignInput,
  MarketingOverview,
} from './marketing.types';

@Injectable({ providedIn: 'root' })
export class MarketingService {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  async overview(): Promise<MarketingOverview> {
    return this.fetchApi<MarketingOverview>('/api/marketing?action=overview');
  }

  async audience(
    servicoId: string | null,
    somenteContabilizados: boolean,
  ): Promise<MarketingAudience> {
    const params = new URLSearchParams({
      action: 'audience',
      somenteContabilizados: String(somenteContabilizados),
    });
    if (servicoId) params.set('servicoId', servicoId);
    return this.fetchApi<MarketingAudience>(`/api/marketing?${params.toString()}`);
  }

  async listCampaigns(): Promise<MarketingCampaign[]> {
    const payload = await this.fetchApi<{ campanhas: MarketingCampaign[] }>('/api/marketing?action=campaigns');
    return payload.campanhas;
  }

  async getCampaign(id: string): Promise<MarketingCampaign> {
    const params = new URLSearchParams({ action: 'campaign', id });
    const payload = await this.fetchApi<{ campanha: MarketingCampaign }>(
      `/api/marketing?${params.toString()}`,
    );
    return payload.campanha;
  }

  async create(input: MarketingCampaignInput): Promise<MarketingCampaign> {
    const payload = await this.postApi<{ campanha?: MarketingCampaign }>('/api/marketing', {
      action: 'create',
      ...input,
    });
    if (!payload.campanha) throw new Error('Campanha não foi criada');
    return payload.campanha;
  }

  async sendTest(email: string, assunto: string, mensagem: string): Promise<void> {
    await this.postApi('/api/marketing', { action: 'test', email, assunto, mensagem });
  }

  async download(field: 'emails' | 'whatsapps'): Promise<void> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(`/api/marketing?action=download&field=${field}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }

    const blob = await response.blob();
    const filename = field === 'emails' ? 'emails-marketing.csv' : 'whatsapps-marketing.csv';
    const urlApi = this.document.defaultView?.URL;
    if (!urlApi) throw new Error('Download indisponível neste ambiente');
    const url = urlApi.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    urlApi.revokeObjectURL(url);
  }

  private async fetchApi<T>(url: string): Promise<T> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }

  private async postApi<T = Record<string, never>>(url: string, body: unknown): Promise<T> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }
}
