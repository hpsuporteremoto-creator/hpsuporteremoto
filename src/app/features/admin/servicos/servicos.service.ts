import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  Servico,
  ServicoCategoria,
  ServicoCategoriaFormData,
  ServicoFormData,
  ServicosCounts,
} from './servicos.types';

const SERVICO_SELECT = `
  id, nome, categoria_id, descricao, imagem_url,
  valor_centavos, ativo, created_at,
  categoria:servico_categorias ( id, nome, descricao, ativo )
`;

@Injectable({ providedIn: 'root' })
export class ServicosService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'servicos';

  async list(): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .order('nome', {
        ascending: true,
        referencedTable: 'servico_categorias',
      })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Servico[];
  }

  async listByAtivo(ativo: boolean): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .eq('ativo', ativo)
      .order('nome', {
        ascending: true,
        referencedTable: 'servico_categorias',
      })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Servico[];
  }

  async listAtivos(): Promise<Servico[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .eq('ativo', true)
      .order('nome', {
        ascending: true,
        referencedTable: 'servico_categorias',
      })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Servico[];
  }

  async get(id: string): Promise<Servico | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as unknown as Servico | null;
  }

  async getMany(ids: readonly string[]): Promise<Servico[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from(this.table)
      .select(SERVICO_SELECT)
      .in('id', [...ids])
      .eq('ativo', true);
    if (error) throw new Error(error.message);
    const servicos = (data ?? []) as unknown as Servico[];
    const byId = new Map(servicos.map((servico) => [servico.id, servico]));
    return ids.flatMap((id) => {
      const servico = byId.get(id);
      return servico ? [servico] : [];
    });
  }

  async create(input: ServicoFormData): Promise<Servico> {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert(input)
      .select(SERVICO_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as Servico;
  }

  async update(id: string, input: Partial<ServicoFormData>): Promise<Servico> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select(SERVICO_SELECT)
      .single();
    if (error) throw new Error(error.message);
    return data as unknown as Servico;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.supabase.from(this.table).update({ ativo }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async counts(): Promise<ServicosCounts> {
    const [ativos, inativos] = await Promise.all([
      this.countByAtivo(true),
      this.countByAtivo(false),
    ]);
    return { ativos, inativos };
  }

  private async countByAtivo(ativo: boolean): Promise<number> {
    const { count, error } = await this.supabase
      .from(this.table)
      .select('id', { count: 'exact', head: true })
      .eq('ativo', ativo);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }
}

@Injectable({ providedIn: 'root' })
export class ServicoCategoriasService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'servico_categorias';

  async list(): Promise<ServicoCategoria[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .order('ativo', { ascending: false })
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ServicoCategoria[];
  }

  async listAtivas(): Promise<ServicoCategoria[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('ativo', true)
      .order('nome', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ServicoCategoria[];
  }

  async get(id: string): Promise<ServicoCategoria | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle<ServicoCategoria>();
    if (error) throw new Error(error.message);
    return data;
  }

  async create(input: ServicoCategoriaFormData): Promise<ServicoCategoria> {
    const { data, error } = await this.supabase
      .from(this.table)
      .insert(input)
      .select()
      .single<ServicoCategoria>();
    if (error) throw toCategoriaError(error);
    return data;
  }

  async update(
    id: string,
    input: Partial<ServicoCategoriaFormData>,
  ): Promise<ServicoCategoria> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select()
      .single<ServicoCategoria>();
    if (error) throw toCategoriaError(error);
    return data;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .update({ ativo })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.table).delete().eq('id', id);
    if (error) throw toCategoriaError(error);
  }
}

function toCategoriaError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error('Já existe uma categoria com este nome.');
  }
  if (error.code === '23503') {
    return new Error('Esta categoria está em uso por serviços cadastrados.');
  }
  return new Error(error.message);
}
