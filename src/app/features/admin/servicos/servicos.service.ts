import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  Servico,
  ServicoCategoria,
  ServicoCategoriaFormData,
  ServicoFormData,
  ServicosCounts,
  ServicosListQuery,
  ServicosListResult,
} from './servicos.types';
import { normalizeServiceImageUrl } from '../../../shared/image-url.util';

@Injectable({ providedIn: 'root' })
export class ServicosService {
  private readonly auth = inject(AuthService);

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

  async listPage(query: ServicosListQuery): Promise<ServicosListResult> {
    const params = new URLSearchParams({
      ativo: String(query.ativo),
      pageIndex: String(Math.max(0, query.pageIndex)),
      pageSize: String(Math.max(1, query.pageSize)),
    });
    const termo = query.termo?.trim();
    if (termo) params.set('termo', termo);
    if (query.categoriaId) params.set('categoriaId', query.categoriaId);

    const payload = await this.fetchApi<{
      servicos?: Servico[];
      total?: number;
      counts?: ServicosCounts;
      error?: string;
    }>(`/api/services?${params.toString()}`);

    return {
      servicos: normalizeServicos(payload.servicos ?? []),
      total: payload.total ?? 0,
      counts: payload.counts ?? { ativos: 0, inativos: 0 },
    };
  }

  async listAtivos(): Promise<Servico[]> {
    return this.listByAtivo(true);
  }

  async get(id: string): Promise<Servico | null> {
    const payload = await this.fetchApi<{ servico?: Servico | null; error?: string }>(
      `/api/services?id=${encodeURIComponent(id)}`,
    );
    return payload.servico ? normalizeServico(payload.servico) : null;
  }

  async getMany(ids: readonly string[]): Promise<Servico[]> {
    if (ids.length === 0) return [];
    const payload = await this.fetchApi<{ servicos?: Servico[]; error?: string }>(
      `/api/services?ativo=true&ids=${encodeURIComponent(ids.join(','))}`,
    );
    return normalizeServicos(payload.servicos ?? []);
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

  async uploadImagem(file: File): Promise<string> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const formData = new FormData();
    formData.set('file', file);

    const response = await fetch('/api/upload-service-image', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!response.ok || !payload.url) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
    return payload.url;
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
    vitrine: servico.vitrine !== false,
  };
}
