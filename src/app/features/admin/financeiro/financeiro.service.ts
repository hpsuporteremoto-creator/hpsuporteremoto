import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  PixRecebedor,
  PixRecebedorFormData,
  ResumoFinanceiro,
  Transacao,
  TransacaoFormData,
} from './financeiro.types';

@Injectable({ providedIn: 'root' })
export class FinanceiroService {
  private readonly auth = inject(AuthService);

  async list(from: string, to: string): Promise<Transacao[]> {
    const params = new URLSearchParams({ from, to });
    const payload = await this.fetchApi<{ transacoes?: Transacao[]; error?: string }>(
      `/api/financeiro?${params.toString()}`,
    );
    return payload.transacoes ?? [];
  }

  async get(id: string): Promise<Transacao | null> {
    const all = await this.list('1900-01-01', '2999-12-31');
    return all.find((transacao) => transacao.id === id) ?? null;
  }

  async create(input: TransacaoFormData): Promise<Transacao> {
    const payload = await this.postApi<{ transacao?: Transacao; error?: string }>('/api/financeiro', {
      action: 'create',
      ...input,
    });
    if (!payload.transacao) throw new Error('Falha ao criar transação');
    return payload.transacao;
  }

  async remove(id: string): Promise<void> {
    await this.postApi('/api/financeiro', { action: 'delete', id });
  }

  async listPixRecebedores(): Promise<PixRecebedor[]> {
    const payload = await this.fetchApi<{ recebedores?: PixRecebedor[]; error?: string }>(
      '/api/financeiro?action=pix',
    );
    return payload.recebedores ?? [];
  }

  async createPixRecebedor(input: PixRecebedorFormData): Promise<PixRecebedor> {
    const payload = await this.postApi<{ recebedor?: PixRecebedor; error?: string }>('/api/financeiro', {
      action: 'create-pix',
      ...input,
    });
    if (!payload.recebedor) throw new Error('Falha ao cadastrar chave PIX');
    return payload.recebedor;
  }

  async updatePixRecebedor(id: string, input: PixRecebedorFormData): Promise<PixRecebedor> {
    const payload = await this.postApi<{ recebedor?: PixRecebedor; error?: string }>('/api/financeiro', {
      action: 'update-pix',
      id,
      ...input,
    });
    if (!payload.recebedor) throw new Error('Falha ao atualizar chave PIX');
    return payload.recebedor;
  }

  async togglePixRecebedor(id: string, ativo: boolean): Promise<void> {
    await this.postApi('/api/financeiro', { action: 'toggle-pix', id, ativo });
  }

  async definirPixRecebedorPadrao(id: string): Promise<void> {
    await this.postApi('/api/financeiro', { action: 'set-default-pix', id });
  }

  static calcularResumo(transacoes: ReadonlyArray<Transacao>): ResumoFinanceiro {
    return transacoes.reduce(
      (resumo, transacao) => ({
        entradas: resumo.entradas + (transacao.tipo === 'entrada' ? transacao.valor_centavos : 0),
        saidas: resumo.saidas + (transacao.tipo === 'saida' ? transacao.valor_centavos : 0),
        saldo: resumo.saldo + (transacao.tipo === 'entrada' ? transacao.valor_centavos : -transacao.valor_centavos),
      }),
      { entradas: 0, saidas: 0, saldo: 0 },
    );
  }

  private async fetchApi<T extends { error?: string }>(url: string): Promise<T> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }

  private async postApi<T extends { error?: string } = { error?: string }>(url: string, body: unknown): Promise<T> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }
}
