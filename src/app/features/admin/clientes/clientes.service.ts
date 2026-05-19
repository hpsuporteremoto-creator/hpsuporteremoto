import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { Cliente, ClienteFormData } from './clientes.types';

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'clientes';

  async list(): Promise<Cliente[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as Cliente[];
  }

  async get(id: string): Promise<Cliente | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle<Cliente>();
    if (error) throw new Error(error.message);
    return data;
  }

  async create(input: ClienteFormData): Promise<Cliente> {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert(input)
      .select()
      .single<Cliente>();
    if (error) throw new Error(error.message);
    return data;
  }

  async update(id: string, input: Partial<ClienteFormData>): Promise<Cliente> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select()
      .single<Cliente>();
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
