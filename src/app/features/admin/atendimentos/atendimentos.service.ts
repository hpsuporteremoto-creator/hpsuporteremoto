import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  AtendimentoComRelacoes,
  AtendimentoServicoRef,
  AtendimentoListFilter,
  AtendimentoListOptions,
  AtendimentoState,
  CriarAtendimentoParaClienteData,
} from './atendimentos.types';

const SELECT = `
  id, cliente_id, servico_id, servico_ids, rustdesk_id, rustdesk_password,
  state, valor_centavos, pix_brcode, descricao_solicitacao,
  created_at, updated_at,
  cliente:clientes ( id, nome, whatsapp, instagram, email ),
  servico:servicos ( id, nome, valor_centavos )
`;

@Injectable({ providedIn: 'root' })
export class AtendimentosService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  async list(
    filter: AtendimentoListFilter,
    options: AtendimentoListOptions = {},
  ): Promise<AtendimentoComRelacoes[]> {
    let query = this.supabase
      .from('atendimentos')
      .select(SELECT)
      .order('created_at', { ascending: false });

    if (!options.todosOsStatus) {
      if (filter === 'novos') {
        query = query.eq('state', 'aguardando_confirmacao');
      } else {
        query = query.eq('state', filter);
      }
    }

    if (options.clienteId) {
      query = query.eq('cliente_id', options.clienteId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return this.hydrateServicosSolicitados((data ?? []) as unknown as AtendimentoComRelacoes[]);
  }

  async get(id: string): Promise<AtendimentoComRelacoes | null> {
    const { data, error } = await this.supabase
      .from('atendimentos')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const rows = await this.hydrateServicosSolicitados(
      data ? ([data] as unknown as AtendimentoComRelacoes[]) : [],
    );
    return rows[0] ?? null;
  }

  async updateState(id: string, state: AtendimentoState): Promise<void> {
    const { error } = await this.supabase.from('atendimentos').update({ state }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async criarParaCliente(
    clienteId: string,
    data: CriarAtendimentoParaClienteData,
  ): Promise<string> {
    const { data: row, error } = await this.supabase
      .from('atendimentos')
      .insert({
        cliente_id: clienteId,
        servico_id: data.servico_ids[0] ?? null,
        servico_ids: data.servico_ids,
        descricao_solicitacao: data.descricao_solicitacao,
        state: 'em_andamento',
      })
      .select('id')
      .single<{ id: string }>();

    if (error || !row) {
      throw new Error(error?.message ?? 'Falha ao criar atendimento');
    }
    return row.id;
  }

  async cobrarEFinalizar(
    atendimento_id: string,
    servico_ids: readonly string[],
  ): Promise<{ pix_brcode: string; valor_centavos: number }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/generate-pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ atendimento_id, servico_ids }),
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

  private async hydrateServicosSolicitados(
    rows: AtendimentoComRelacoes[],
  ): Promise<AtendimentoComRelacoes[]> {
    const ids = Array.from(
      new Set(
        rows.flatMap((row) => {
          const ids = row.servico_ids ?? [];
          return ids.length > 0 ? ids : row.servico_id ? [row.servico_id] : [];
        }),
      ),
    );
    if (ids.length === 0) {
      return rows.map((row) => ({ ...row, servicos_solicitados: [] }));
    }

    const { data, error } = await this.supabase
      .from('servicos')
      .select('id, nome, valor_centavos')
      .in('id', ids);
    if (error) throw new Error(error.message);

    const byId = new Map(
      ((data ?? []) as AtendimentoServicoRef[]).map((servico) => [servico.id, servico]),
    );
    return rows.map((row) => {
      const rowIds =
        row.servico_ids && row.servico_ids.length > 0
          ? row.servico_ids
          : row.servico_id
            ? [row.servico_id]
            : [];
      return {
        ...row,
        servicos_solicitados: rowIds.flatMap((id) => {
          const servico = byId.get(id);
          return servico ? [servico] : [];
        }),
      };
    });
  }
}
