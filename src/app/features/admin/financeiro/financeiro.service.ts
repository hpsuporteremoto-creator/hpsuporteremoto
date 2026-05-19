import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  ResumoFinanceiro,
  Transacao,
  TransacaoFormData,
} from './financeiro.types';

@Injectable({ providedIn: 'root' })
export class FinanceiroService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'transacoes';

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
