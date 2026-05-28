import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  AtendimentoComRelacoes,
  AtendimentoListFilter,
  AtendimentoListOptions,
  AtendimentoServicoInput,
  AtendimentoState,
  AtualizarAtendimentoEmAndamentoData,
  CriarAtendimentoParaClienteData,
} from './atendimentos.types';

@Injectable({ providedIn: 'root' })
export class AtendimentosService {
  private readonly auth = inject(AuthService);

  async list(
    filter: AtendimentoListFilter,
    options: AtendimentoListOptions = {},
  ): Promise<AtendimentoComRelacoes[]> {
    const params = new URLSearchParams({
      filter,
      todosOsStatus: String(Boolean(options.todosOsStatus)),
    });
    if (options.clienteId) {
      params.set('clienteId', options.clienteId);
    }

    const payload = await this.fetchApi<{
      atendimentos?: AtendimentoComRelacoes[];
      error?: string;
    }>(`/api/list-atendimentos?${params.toString()}`);
    return payload.atendimentos ?? [];
  }

  async get(id: string): Promise<AtendimentoComRelacoes | null> {
    const payload = await this.fetchApi<{
      atendimento?: AtendimentoComRelacoes | null;
      error?: string;
    }>(`/api/get-atendimento?id=${encodeURIComponent(id)}`);
    return payload.atendimento ?? null;
  }

  async updateState(id: string, state: AtendimentoState): Promise<void> {
    await this.postApi('/api/update-atendimento-state', { id, state });
  }

  async atualizarEmAndamento(
    id: string,
    data: AtualizarAtendimentoEmAndamentoData,
  ): Promise<void> {
    await this.postApi('/api/update-atendimento', {
      id,
      servico_itens: data.servico_itens,
      desconto_centavos: data.desconto_centavos,
      descricao_solicitacao: data.descricao_solicitacao,
    });
  }

  async excluir(id: string): Promise<void> {
    await this.postApi('/api/delete-atendimento', { id });
  }

  async atualizarContabilidade(id: string, contabilizar: boolean): Promise<void> {
    await this.postApi('/api/update-atendimento-accounting', { id, contabilizar });
  }

  async criarParaCliente(
    clienteId: string,
    data: CriarAtendimentoParaClienteData,
  ): Promise<string> {
    const payload = await this.postApi<{ id?: string; error?: string }>('/api/create-atendimento', {
      cliente_id: clienteId,
      servico_itens: data.servico_itens,
      desconto_centavos: data.desconto_centavos,
      descricao_solicitacao: data.descricao_solicitacao,
    });
    if (!payload.id) {
      throw new Error('Falha ao criar atendimento');
    }
    return payload.id;
  }

  async cobrarEFinalizar(
    atendimento_id: string,
    servico_itens: readonly AtendimentoServicoInput[],
    desconto_centavos: number,
    descricao_solicitacao?: string | null,
  ): Promise<{ pix_brcode: string; valor_centavos: number }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/generate-pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        atendimento_id,
        servico_itens,
        desconto_centavos,
        descricao_solicitacao,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      pix_brcode?: string;
      valor_centavos?: number;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
    return {
      pix_brcode: payload.pix_brcode ?? '',
      valor_centavos: payload.valor_centavos ?? 0,
    };
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
