import {
  Injectable,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RealtimeChannel } from '@supabase/supabase-js';
import { AuthService } from '../../../core/auth/auth.service';
import { NotificationService } from '../../../core/notifications/notification.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  Atendimento,
  AtendimentoComRelacoes,
  AtendimentoListFilter,
  AtendimentoState,
} from './atendimentos.types';

const SELECT = `
  id, cliente_id, servico_id, rustdesk_id, rustdesk_password,
  state, valor_centavos, pix_brcode, descricao_solicitacao,
  created_at, updated_at,
  cliente:clientes ( id, nome, whatsapp, instagram, email ),
  servico:servicos ( id, nome, valor_centavos )
`;

@Injectable({ providedIn: 'root' })
export class AtendimentosService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private adminChannel: RealtimeChannel | null = null;

  private readonly _newCount = signal(0);
  readonly newCount = this._newCount.asReadonly();

  constructor() {
    if (this.isBrowser) {
      void this.bootstrapAdminRealtime();
    }
  }

  private async bootstrapAdminRealtime(): Promise<void> {
    await this.auth.ready;
    if (!this.auth.isAdmin()) return;
    if (this.adminChannel) return;

    this.adminChannel = this.supabase
      .channel('atendimentos-admin')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'atendimentos',
        },
        (payload) => {
          const a = payload.new as Atendimento;
          this._newCount.update((n) => n + 1);
          this.notifications.notify(
            'Nova solicitação',
            `Atendimento via RustDesk ${a.rustdesk_id}`,
            { tag: `nova:${a.id}` },
          );
        },
      )
      .subscribe();
  }

  resetNewCount(): void {
    this._newCount.set(0);
  }

  async list(filter: AtendimentoListFilter): Promise<AtendimentoComRelacoes[]> {
    let query = this.supabase
      .from('atendimentos')
      .select(SELECT)
      .order('created_at', { ascending: false });

    if (filter === 'em-andamento') {
      query = query.in('state', ['aguardando_confirmacao', 'em_andamento']);
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
