import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  Servico,
  ServicoCategoria,
  ServicoCategoriaFormData,
  ServicoFormData,
  ServicosCounts,
} from './servicos.types';
import { normalizeServiceImageUrl } from '../../../shared/image-url.util';

const SERVICO_SELECT = `
  id, nome, categoria_id, descricao, imagem_url,
  valor_centavos, ativo, created_at,
  categoria:servico_categorias ( id, nome, descricao, ativo )
`;

@Injectable({ providedIn: 'root' })
export class ServicosService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'servicos';

  async list(): Promise<Servico[]> {
    const payload = await this.fetchApi<{ servicos?: Servico[]; error?: string }>(
      '/api/services',
    );
    return normalizeServicos(payload.servicos ?? []);
  }

  async listByAtivo(ativo: boolean): Promise<Servico[]> {
    const payload = await this.fetchApi<{ servicos?: Servico[]; error?: string }>(
      `/api/services?ativo=${String(ativo)}`,
    );
    return normalizeServicos(payload.servicos ?? []);
  }

  async listAtivos(): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .eq('ativo', true)
      .order('nome', {
        ascending: true,
        referencedTable: 'servico_categorias',
      })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return normalizeServicos((data ?? []) as unknown as Servico[]);
  }

  async get(id: string): Promise<Servico | null> {
    const payload = await this.fetchApi<{ servico?: Servico | null; error?: string }>(
      `/api/services?id=${encodeURIComponent(id)}`,
    );
    return payload.servico ? normalizeServico(payload.servico) : null;
  }

  async getMany(ids: readonly string[]): Promise<Servico[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .in('id', [...ids])
      .eq('ativo', true);
    if (error) throw new Error(error.message);
    const servicos = normalizeServicos((data ?? []) as unknown as Servico[]);
    const byId = new Map(servicos.map((servico) => [servico.id, servico]));
    return ids.flatMap((id) => {
      const servico = byId.get(id);
      return servico ? [servico] : [];
    });
  }

  async create(input: ServicoFormData): Promise<Servico> {
    const payload = await this.postApi<{ servico?: Servico; error?: string }>(
      '/api/services',
      { action: 'create', ...normalizeServicoInput(input) },
    );
    if (!payload.servico) throw new Error('Falha ao criar serviço');
    return normalizeServico(payload.servico);
  }

  async update(id: string, input: Partial<ServicoFormData>): Promise<Servico> {
    const payload = await this.postApi<{ servico?: Servico; error?: string }>(
      '/api/services',
      { action: 'update', id, ...normalizeServicoPatch(input) },
    );
    if (!payload.servico) throw new Error('Falha ao atualizar serviço');
    return normalizeServico(payload.servico);
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    await this.postApi('/api/services', { action: 'toggle', id, ativo });
  }

  async counts(): Promise<ServicosCounts> {
    const payload = await this.fetchApi<{ counts?: ServicosCounts; error?: string }>(
      '/api/services',
    );
    return payload.counts ?? { ativos: 0, inativos: 0 };
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

  private async postApi<T extends { error?: string } = { error?: string }>(
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

@Injectable({ providedIn: 'root' })
export class ServicoCategoriasService {
  private readonly auth = inject(AuthService);
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'servico_categorias';

  async list(): Promise<ServicoCategoria[]> {
    const payload = await this.fetchApi<{
      categorias?: ServicoCategoria[];
      error?: string;
    }>('/api/service-categories');
    return payload.categorias ?? [];
  }

  async listAtivas(): Promise<ServicoCategoria[]> {
    const payload = await this.fetchApi<{
      categorias?: ServicoCategoria[];
      error?: string;
    }>('/api/service-categories?ativas=true');
    return payload.categorias ?? [];
  }

  async get(id: string): Promise<ServicoCategoria | null> {
    const payload = await this.fetchApi<{
      categoria?: ServicoCategoria | null;
      error?: string;
    }>(`/api/service-categories?id=${encodeURIComponent(id)}`);
    return payload.categoria ?? null;
  }

  async create(input: ServicoCategoriaFormData): Promise<ServicoCategoria> {
    const payload = await this.postApi<{
      categoria?: ServicoCategoria;
      error?: string;
    }>('/api/service-categories', { action: 'create', ...input });
    if (!payload.categoria) throw new Error('Falha ao criar categoria');
    return payload.categoria;
  }

  async update(
    id: string,
    input: Partial<ServicoCategoriaFormData>,
  ): Promise<ServicoCategoria> {
    const payload = await this.postApi<{
      categoria?: ServicoCategoria;
      error?: string;
    }>('/api/service-categories', { action: 'update', id, ...input });
    if (!payload.categoria) throw new Error('Falha ao atualizar categoria');
    return payload.categoria;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    await this.postApi('/api/service-categories', { action: 'toggle', id, ativo });
  }

  async delete(id: string): Promise<void> {
    await this.postApi('/api/service-categories', { action: 'delete', id });
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

  private async postApi<T extends { error?: string } = { error?: string }>(
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

function toCategoriaError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error('Já existe uma categoria com este nome.');
  }
  if (error.code === '23503') {
    return new Error('Esta categoria está em uso por serviços cadastrados.');
  }
  return new Error(error.message);
}

function normalizeServicoInput(input: ServicoFormData): ServicoFormData {
  return {
    ...input,
    imagem_url: normalizeServiceImageUrl(input.imagem_url),
  };
}

function normalizeServicoPatch(
  input: Partial<ServicoFormData>,
): Partial<ServicoFormData> {
  if (!('imagem_url' in input)) return input;
  return {
    ...input,
    imagem_url: normalizeServiceImageUrl(input.imagem_url),
  };
}

function normalizeServicos(servicos: Servico[]): Servico[] {
  return servicos.map((servico) => normalizeServico(servico));
}

function normalizeServico(servico: Servico): Servico {
  return {
    ...servico,
    imagem_url: normalizeServiceImageUrl(servico.imagem_url),
  };
}
