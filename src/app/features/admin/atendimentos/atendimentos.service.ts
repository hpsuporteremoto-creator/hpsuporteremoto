import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  AtendimentoComRelacoes,
  AtendimentoServicoRef,
  AtendimentoListFilter,
  AtendimentoState,
  CriarAtendimentoData,
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

  async list(filter: AtendimentoListFilter): Promise<AtendimentoComRelacoes[]> {
    let query = this.supabase
      .from('atendimentos')
      .select(SELECT)
      .order('created_at', { ascending: false });

    if (filter === 'novos') {
      query = query.eq('state', 'aguardando_confirmacao');
    } else {
      query = query.eq('state', filter);
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

  async criarManual(data: CriarAtendimentoData): Promise<string> {
    const { data: id, error } = await this.supabase.rpc('criar_atendimento', {
      p_nome: data.nome,
      p_whatsapp: data.whatsapp,
      p_instagram: data.instagram,
      p_email: data.email,
      p_rustdesk_id: data.rustdesk_id,
      p_rustdesk_password: data.rustdesk_password,
      p_servico_id: data.servico_id,
      p_servico_ids: data.servico_ids,
      p_descricao_solicitacao: data.descricao_solicitacao,
    });

    if (error || typeof id !== 'string') {
      throw new Error(error?.message ?? 'Falha ao criar atendimento');
    }

    await this.updateState(id, 'em_andamento');
    return id;
  }

  async cobrarEFinalizar(
    atendimento_id: string,
    servico_id: string,
  ): Promise<{ pix_brcode: string; valor_centavos: number }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/generate-pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ atendimento_id, servico_id }),
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
