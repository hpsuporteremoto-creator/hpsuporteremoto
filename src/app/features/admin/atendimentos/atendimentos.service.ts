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
  PixRecebedorResumo,
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

  async atualizarEmAndamento(id: string, data: AtualizarAtendimentoEmAndamentoData): Promise<void> {
    await this.postApi('/api/update-atendimento', {
      id,
      servico_itens: data.servico_itens,
      desconto_centavos: data.desconto_centavos,
      acrescimo_centavos: data.acrescimo_centavos,
      descricao_solicitacao: data.descricao_solicitacao,
    });
  }

  async excluir(id: string): Promise<void> {
    await this.postApi('/api/delete-atendimento', { id });
  }

  async atualizarContabilidade(id: string, contabilizar: boolean): Promise<void> {
    await this.postApi('/api/update-atendimento-accounting', { id, contabilizar });
  }

  async atualizarObservacaoPagamento(
    id: string,
    descricao_solicitacao: string | null,
  ): Promise<void> {
    await this.postApi('/api/update-atendimento-observacao', {
      id,
      descricao_solicitacao,
    });
  }

  async criarParaCliente(
    clienteId: string,
    data: CriarAtendimentoParaClienteData,
  ): Promise<string> {
    const payload = await this.postApi<{ id?: string; error?: string }>('/api/create-atendimento', {
      cliente_id: clienteId,
      servico_itens: data.servico_itens,
      desconto_centavos: data.desconto_centavos,
      acrescimo_centavos: data.acrescimo_centavos,
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
    acrescimo_centavos: number,
    descricao_solicitacao?: string | null,
    pix_recebedor_id?: string | null,
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
        acrescimo_centavos,
        descricao_solicitacao,
        pix_recebedor_id,
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

  async listPixRecebedores(): Promise<PixRecebedorResumo[]> {
    const payload = await this.fetchApi<{ recebedores?: PixRecebedorResumo[]; error?: string }>(
      '/api/pix-recebedores',
    );
    return payload.recebedores ?? [];
  }

  async enviarComprovante(atendimentoId: string, file: File): Promise<{
    path: string;
    nome: string;
    tipo: string;
  }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const body = new FormData();
    body.append('atendimento_id', atendimentoId);
    body.append('file', file);
    const response = await fetch('/api/payment-receipt', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      comprovante?: { path?: string; nome?: string; tipo?: string };
    };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    const comprovante = payload.comprovante;
    if (!comprovante?.path || !comprovante.nome || !comprovante.tipo) {
      throw new Error('Falha ao anexar comprovante');
    }
    return { path: comprovante.path, nome: comprovante.nome, tipo: comprovante.tipo };
  }

  async confirmarPagamento(input: {
    atendimento_id: string;
    comprovante_path?: string | null;
    comprovante_nome?: string | null;
    comprovante_tipo?: string | null;
  }): Promise<void> {
    await this.postApi('/api/confirm-payment', input);
  }

  async abrirComprovante(atendimentoId: string): Promise<string> {
    const payload = await this.fetchApi<{ url?: string; error?: string }>(
      `/api/payment-receipt?atendimento_id=${encodeURIComponent(atendimentoId)}`,
    );
    if (!payload.url) throw new Error('Comprovante indisponível');
    return payload.url;
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
