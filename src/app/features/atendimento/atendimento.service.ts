import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/supabase/supabase.service';
import {
  Atendimento,
  AtendimentoState,
  ConexaoFormData,
  STORAGE_KEY,
} from './atendimento.types';

@Injectable({ providedIn: 'root' })
export class AtendimentoService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _atendimento = signal<Atendimento | null>(null);
  private channel: RealtimeChannel | null = null;

  readonly atendimento = this._atendimento.asReadonly();
  readonly state = computed<AtendimentoState>(
    () => this._atendimento()?.state ?? 'conexao',
  );

  constructor() {
    if (this.isBrowser) {
      void this.recuperar();
    }
  }

  async criar(data: ConexaoFormData): Promise<string> {
    const { data: id, error } = await this.supabase.rpc('criar_atendimento', {
      p_nome: data.nome,
      p_whatsapp: data.whatsapp,
      p_instagram: data.instagram,
      p_email: data.email,
      p_rustdesk_id: data.rustdesk_id,
      p_rustdesk_password: data.rustdesk_password,
    });

    if (error || typeof id !== 'string') {
      throw new Error(error?.message ?? 'Falha ao criar atendimento');
    }

    if (this.isBrowser) {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    await this.assinar(id);
    return id;
  }

  async recuperar(): Promise<void> {
    if (!this.isBrowser) return;
    const id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) return;
    await this.assinar(id);
  }

  limpar(): void {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    if (this.isBrowser) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    this._atendimento.set(null);
  }

  private async assinar(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('atendimentos')
      .select('*')
      .eq('id', id)
      .maybeSingle<Atendimento>();

    if (error || !data) {
      // ID inválido ou expirado: limpa estado e localStorage
      this.limpar();
      return;
    }

    this._atendimento.set(data);

    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }

    this.channel = this.supabase
      .channel(`atendimento:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'atendimentos',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const next = payload.new as Atendimento;
          this._atendimento.set(next);
        },
      )
      .subscribe();
  }
}
