import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
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
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'clientes';

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
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select()
      .single<Cliente>();
    if (error) throw toClienteError(error);
    return data;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .update({ ativo })
      .eq('id', id);
    if (error) throw new Error(error.message);
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

// 23505 = violação de índice único do Postgres. Em clientes o único índice
// único é o do WhatsApp, então a colisão é sempre o número já cadastrado.
function toClienteError(error: { code: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error('Já existe um cliente cadastrado com este WhatsApp.');
  }
  return new Error(error.message);
}
