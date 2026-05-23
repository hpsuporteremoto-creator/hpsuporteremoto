import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  PixRecebedorConfig,
  PixRecebedorConfigFormData,
  ResumoFinanceiro,
  Transacao,
  TransacaoFormData,
} from './financeiro.types';

@Injectable({ providedIn: 'root' })
export class FinanceiroService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'transacoes';
  private readonly pixConfigTable = 'pix_recebedor_config';

  async list(from: string, to: string): Promise<Transacao[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .gte('data', from)
      .lte('data', to)
      .order('data', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Transacao[];
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
    const { error } = await this.supabase
      .from(this.table)
      .delete()
      .eq('id', id);
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

  async savePixRecebedorConfig(
    input: PixRecebedorConfigFormData,
  ): Promise<PixRecebedorConfig> {
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
}
