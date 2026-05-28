import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  PixRecebedorConfig,
  PixRecebedorConfigFormData,
  ResumoFinanceiro,
  Transacao,
  TransacaoAtendimentoRef,
  TransacaoFormData,
  TransacaoServicoRef,
} from './financeiro.types';

type TransacaoRow = Omit<Transacao, 'atendimento'> & {
  atendimento?: TransacaoAtendimentoRef | TransacaoAtendimentoRef[] | null;
};

type ServicoBase = Omit<TransacaoServicoRef, 'quantidade' | 'subtotal_centavos'>;

@Injectable({ providedIn: 'root' })
export class FinanceiroService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'transacoes';
  private readonly pixConfigTable = 'pix_recebedor_config';

  async list(from: string, to: string): Promise<Transacao[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(
        `
          id, tipo, valor_centavos, descricao, atendimento_id,
          data, created_at, updated_at,
          atendimento:atendimentos (
            id,
            servico_id,
            servico_ids,
            descricao_solicitacao,
            cliente:clientes ( id, nome )
          )
        `,
      )
      .gte('data', from)
      .lte('data', to)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return this.hydrateTransacoes((data ?? []) as unknown as TransacaoRow[]);
  }

  async get(id: string): Promise<Transacao | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle<Transacao>();
    if (error) throw new Error(error.message);
    return data;
  }

  async create(input: TransacaoFormData): Promise<Transacao> {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert(input)
      .select()
      .single<Transacao>();
    if (error) throw new Error(error.message);
    return data;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async getPixRecebedorConfig(): Promise<PixRecebedorConfig | null> {
    const { data, error } = await this.supabase
      .from(this.pixConfigTable)
      .select('*')
      .eq('id', 1)
      .maybeSingle<PixRecebedorConfig>();
    if (error) throw new Error(error.message);
    return data;
  }

  async savePixRecebedorConfig(input: PixRecebedorConfigFormData): Promise<PixRecebedorConfig> {
    const { data, error } = await this.supabase
      .from(this.pixConfigTable)
      .upsert({ id: 1, ...input }, { onConflict: 'id' })
      .select()
      .single<PixRecebedorConfig>();
    if (error) throw new Error(error.message);
    return data;
  }

  static calcularResumo(transacoes: ReadonlyArray<Transacao>): ResumoFinanceiro {
    let entradas = 0;
    let saidas = 0;
    for (const t of transacoes) {
      if (t.tipo === 'entrada') entradas += t.valor_centavos;
      else saidas += t.valor_centavos;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }

  private async hydrateTransacoes(rows: readonly TransacaoRow[]): Promise<Transacao[]> {
    const normalizedRows = rows.map((row) => ({
      ...row,
      atendimento: Array.isArray(row.atendimento)
        ? (row.atendimento[0] ?? null)
        : (row.atendimento ?? null),
    }));
    const servicoIds = Array.from(
      new Set(
        normalizedRows.flatMap((row) => {
          const atendimento = row.atendimento;
          if (!atendimento) return [];
          const ids = atendimento.servico_ids ?? [];
          return ids.length > 0 ? ids : atendimento.servico_id ? [atendimento.servico_id] : [];
        }),
      ),
    );
    const servicosById = await this.getServicosById(servicoIds);

    return normalizedRows.map((row) => {
      const atendimento = row.atendimento;
      if (!atendimento) return { ...row, atendimento: null };

      const ids =
        atendimento.servico_ids && atendimento.servico_ids.length > 0
          ? atendimento.servico_ids
          : atendimento.servico_id
            ? [atendimento.servico_id]
            : [];
      const quantities = new Map<string, number>();
      for (const id of ids) {
        quantities.set(id, (quantities.get(id) ?? 0) + 1);
      }

      return {
        ...row,
        atendimento: {
          ...atendimento,
          servicos_solicitados: Array.from(quantities.entries()).flatMap(([id, quantidade]) => {
            const servico = servicosById.get(id);
            return servico
              ? [
                  {
                    ...servico,
                    quantidade,
                    subtotal_centavos: servico.valor_centavos * quantidade,
                  },
                ]
              : [];
          }),
        },
      };
    });
  }

  private async getServicosById(ids: readonly string[]): Promise<Map<string, ServicoBase>> {
    if (ids.length === 0) return new Map();

    const { data, error } = await this.supabase
      .from('servicos')
      .select('id, nome, valor_centavos')
      .in('id', ids);
    if (error) throw new Error(error.message);

    return new Map(((data ?? []) as ServicoBase[]).map((servico) => [servico.id, servico]));
  }
}
