import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import { onlyDigits } from '../../../shared/whatsapp.util';
import { Cliente, ClienteFormData } from './clientes.types';

export interface ClientesListQuery {
  ativo: boolean;
  termo: string;
  pageIndex: number;
  pageSize: number;
}

export interface ClientesListResult {
  clientes: Cliente[];
  total: number;
}

export interface ClientesCounts {
  ativos: number;
  inativos: number;
}

@Injectable({ providedIn: 'root' })
export class ClientesService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly table = 'clientes';

  async list(query: ClientesListQuery): Promise<ClientesListResult> {
    const from = query.pageIndex * query.pageSize;
    const to = from + query.pageSize - 1;
    let request = this.supabase
      .from(this.table)
      .select('*', { count: 'exact' })
      .eq('ativo', query.ativo)
      .order('nome', { ascending: true })
      .range(from, to);

    const termo = query.termo.trim();
    if (termo) {
      request = request.or(createSearchFilter(termo));
    }

    const { data, error, count } = await request;
    if (error) throw new Error(error.message);
    return {
      clientes: (data ?? []) as Cliente[],
      total: count ?? 0,
    };
  }

  async counts(): Promise<ClientesCounts> {
    const [ativos, inativos] = await Promise.all([
      this.countByAtivo(true),
      this.countByAtivo(false),
    ]);
    return { ativos, inativos };
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
    if (error) throw toClienteError(error);
    return data;
  }

  async update(id: string, input: Partial<ClienteFormData>): Promise<Cliente> {
    const { data, error } = await this.supabase
      .from(this.table)
      .update(input)
      .eq('id', id)
      .select()
      .single<Cliente>();
    if (error) throw toClienteError(error);
    return data;
  }

  async toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .update({ ativo })
      .eq('id', id);
    if (error) throw new Error(error.message);
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

function createSearchFilter(value: string): string {
  const termo = escapePostgrestLike(value);
  const digits = onlyDigits(value);
  const filters = [
    `nome.ilike.%${termo}%`,
    `email.ilike.%${termo}%`,
    `instagram.ilike.%${termo}%`,
    `observacao.ilike.%${termo}%`,
  ];
  if (digits) filters.push(`whatsapp.ilike.%${digits}%`);
  return filters.join(',');
}

function escapePostgrestLike(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/,/g, '\\,');
}

// 23505 = violação de índice único do Postgres. Em clientes o único índice
// único é o do WhatsApp, então a colisão é sempre o número já cadastrado.
function toClienteError(error: { code: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error('Já existe um cliente cadastrado com este WhatsApp.');
  }
  return new Error(error.message);
}
