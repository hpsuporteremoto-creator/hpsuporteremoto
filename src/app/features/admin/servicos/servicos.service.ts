import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { Servico, ServicoFormData } from './servicos.types';

@Injectable({ providedIn: 'root' })
export class ServicosService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'servicos';

  async list(): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .order('categoria', { ascending: true, nullsFirst: false })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Servico[];
  }

  async listAtivos(): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('ativo', true)
      .order('categoria', { ascending: true, nullsFirst: false })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Servico[];
  }

  async get(id: string): Promise<Servico | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle<Servico>();
    if (error) throw new Error(error.message);
    return data;
  }

  async create(input: ServicoFormData): Promise<Servico> {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert(input)
      .select()
      .single<Servico>();
    if (error) throw new Error(error.message);
    return data;
  }

  async update(id: string, input: Partial<ServicoFormData>): Promise<Servico> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select()
      .single<Servico>();
    if (error) throw new Error(error.message);
    return data;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .update({ ativo })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }
}
