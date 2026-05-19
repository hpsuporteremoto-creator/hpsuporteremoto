import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  AtendimentoComRelacoes,
  AtendimentoListFilter,
  AtendimentoState,
} from './atendimentos.types';

const SELECT = `
  id, cliente_id, servico_id, rustdesk_id, rustdesk_password,
  state, valor_centavos, pix_brcode, created_at, updated_at,
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

    if (filter === 'em-andamento') {
      query = query.in('state', ['conexao', 'em_atendimento']);
    } else {
      query = query.eq('state', filter);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as AtendimentoComRelacoes[];
  }

  async get(id: string): Promise<AtendimentoComRelacoes | null> {
    const { data, error } = await this.supabase
      .from('atendimentos')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data ?? null) as unknown as AtendimentoComRelacoes | null;
  }

  async updateState(id: string, state: AtendimentoState): Promise<void> {
    const { error } = await this.supabase
      .from('atendimentos')
      .update({ state })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async generatePix(
    atendimento_id: string,
    valor_centavos: number,
  ): Promise<{ pix_brcode: string }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/generate-pix', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ atendimento_id, valor_centavos }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      pix_brcode?: string;
    };

    if (!response.ok) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
    return { pix_brcode: payload.pix_brcode ?? '' };
  }
}
