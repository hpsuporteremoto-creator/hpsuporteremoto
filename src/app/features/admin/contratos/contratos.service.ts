import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Contrato, ContratoFormData, ContratoStatus } from './contratos.types';

@Injectable({ providedIn: 'root' })
export class ContratosService {
  private readonly auth = inject(AuthService);

  async list(status: ContratoStatus | 'todos'): Promise<Contrato[]> {
    const query = status === 'todos' ? '' : `?status=${encodeURIComponent(status)}`;
    const payload = await this.fetchApi<{ contratos?: Contrato[]; error?: string }>(
      `/api/contracts${query}`,
    );
    return payload.contratos ?? [];
  }

  async create(input: ContratoFormData): Promise<Contrato> {
    const payload = await this.postApi<{ contrato?: Contrato; error?: string }>(
      '/api/contracts',
      input,
    );
    if (!payload.contrato) throw new Error('Falha ao salvar contrato');
    return payload.contrato;
  }

  private async fetchApi<T extends { error?: string }>(url: string): Promise<T> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }

  private async postApi<T extends { error?: string }>(url: string, body: unknown): Promise<T> {
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
    const payload = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }
}
