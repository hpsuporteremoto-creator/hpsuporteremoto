import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { Cliente, ClienteFormData } from './clientes.types';

export interface ClientesListQuery {
  ativo: boolean;
  termo: string;
  pageIndex: number;
  pageSize: number;
}

export interface ClientesListResult {
  clientes: Cliente[];
  total: number;
}

export interface ClientesCounts {
  ativos: number;
  inativos: number;
}

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly auth = inject(AuthService);

  async list(query: ClientesListQuery): Promise<ClientesListResult> {
    const params = new URLSearchParams({
      ativo: String(query.ativo),
      termo: query.termo,
      pageIndex: String(query.pageIndex),
      pageSize: String(query.pageSize),
    });
    const payload = await this.fetchApi<{
      clientes?: Cliente[];
      total?: number;
      error?: string;
    }>(`/api/list-clients?${params.toString()}`);
    return {
      clientes: payload.clientes ?? [],
      total: payload.total ?? 0,
    };
  }

  async counts(): Promise<ClientesCounts> {
    const payload = await this.fetchApi<{
      counts?: ClientesCounts;
      error?: string;
    }>('/api/list-clients?ativo=true&pageIndex=0&pageSize=1');
    return payload.counts ?? { ativos: 0, inativos: 0 };
  }

  async get(id: string): Promise<Cliente | null> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(`/api/get-client?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      cliente?: Cliente;
      error?: string;
    };
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload.cliente ?? null;
  }

  async create(input: ClienteFormData): Promise<Cliente> {
    const payload = await this.postApi<{
      cliente?: Cliente;
      error?: string;
    }>('/api/create-client', input);
    if (!payload.cliente) throw new Error('Falha ao criar cliente');
    return payload.cliente;
  }

  async update(id: string, input: Partial<ClienteFormData>): Promise<Cliente> {
    const payload = await this.postApi<{
      cliente?: Cliente;
      error?: string;
    }>('/api/update-client', { id, ...input });
    if (!payload.cliente) throw new Error('Falha ao atualizar cliente');
    return payload.cliente;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    await this.postApi('/api/update-client', { id, ativo });
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

  private async postApi<T extends { error?: string }>(
    url: string,
    body: unknown,
  ): Promise<T> {
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
