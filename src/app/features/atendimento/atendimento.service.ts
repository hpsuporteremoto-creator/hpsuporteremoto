import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RealtimeChannel } from '@supabase/supabase-js';
import { NotificationService } from '../../core/notifications/notification.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { Servico } from '../admin/servicos/servicos.types';
import {
  ATENDIMENTO_STATE_LABEL,
  Atendimento,
  AtendimentoState,
  ClienteLookupResult,
  ConexaoFormData,
  CriarAtendimentoData,
  DRAFT_STORAGE_KEY,
  STORAGE_KEY,
} from './atendimento.types';

interface LookupRpcRow {
  cliente_existe: boolean;
  ativo: boolean;
  nome: string | null;
  instagram: string | null;
  email: string | null;
}

function nullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function isConexaoFormData(value: unknown): value is ConexaoFormData {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const servicoIds = record['servico_ids'];
  return (
    typeof record['nome'] === 'string' &&
    typeof record['whatsapp'] === 'string' &&
    nullableString(record['instagram']) &&
    nullableString(record['email']) &&
    nullableString(record['servico_id']) &&
    Array.isArray(servicoIds) &&
    servicoIds.every((id) => typeof id === 'string') &&
    nullableString(record['descricao_solicitacao'])
  );
}

@Injectable({ providedIn: 'root' })
export class AtendimentoService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly notifications = inject(NotificationService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _atendimento = signal<Atendimento | null>(null);
  private readonly _lookup = signal<ClienteLookupResult | null>(null);
  private readonly _selectedServicos = signal<Servico[]>([]);
  private readonly _draft = signal<ConexaoFormData | null>(null);
  private channel: RealtimeChannel | null = null;

  readonly atendimento = this._atendimento.asReadonly();
  readonly lookup = this._lookup.asReadonly();
  readonly selectedServicos = this._selectedServicos.asReadonly();
  readonly selectedServico = computed(() => this._selectedServicos()[0] ?? null);
  readonly draft = this._draft.asReadonly();
  readonly state = computed<AtendimentoState | null>(() => this._atendimento()?.state ?? null);

  constructor() {
    if (this.isBrowser) {
      this.recuperarDraft();
      void this.recuperar();
    }
  }

  async lookupPorWhatsapp(whatsapp: string): Promise<ClienteLookupResult> {
    const trimmed = whatsapp.trim();
    const { data, error } = await this.supabase.rpc('lookup_cliente_por_whatsapp', {
      p_whatsapp: trimmed,
    });
    if (error) throw new Error(error.message);
    const row = ((data ?? []) as LookupRpcRow[])[0];
    const result: ClienteLookupResult = {
      whatsapp: trimmed,
      cliente_existe: row?.cliente_existe ?? false,
      ativo: row?.ativo ?? false,
      nome: row?.nome ?? null,
      instagram: row?.instagram ?? null,
      email: row?.email ?? null,
    };
    this._lookup.set(result);
    return result;
  }

  voltarParaWhatsapp(): void {
    this._lookup.set(null);
  }

  selecionarServicos(servicos: readonly Servico[]): void {
    this._selectedServicos.set([...servicos]);
  }

  voltarParaVitrine(): void {
    this._selectedServicos.set([]);
    this._lookup.set(null);
    this.limparDraft();
  }

  salvarSolicitacao(data: ConexaoFormData): void {
    this._draft.set(data);
    if (!this.isBrowser) return;
    window.sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(data));
  }

  limparDraft(): void {
    this._draft.set(null);
    if (!this.isBrowser) return;
    window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  }

  async criar(data: CriarAtendimentoData): Promise<string> {
    const { data: id, error } = await this.supabase.rpc('criar_atendimento', {
      p_nome: data.nome,
      p_whatsapp: data.whatsapp,
      p_instagram: data.instagram,
      p_email: data.email,
      p_rustdesk_id: data.rustdesk_id,
      p_rustdesk_password: data.rustdesk_password,
      p_servico_id: data.servico_id,
      p_servico_ids: data.servico_ids,
      p_descricao_solicitacao: data.descricao_solicitacao,
    });

    if (error || typeof id !== 'string') {
      throw new Error(error?.message ?? 'Falha ao criar atendimento');
    }

    if (this.isBrowser) {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    this.limparDraft();
    await this.assinar(id);
    return id;
  }

  async acompanhar(id: string): Promise<void> {
    if (this.isBrowser) {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    await this.assinar(id);
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
    this._lookup.set(null);
    this._selectedServicos.set([]);
    this.limparDraft();
  }

  private recuperarDraft(): void {
    if (!this.isBrowser) return;
    const raw = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isConexaoFormData(parsed)) {
        this._draft.set(parsed);
      } else {
        window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      }
    } catch {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }

  private async assinar(id: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('atendimentos')
      .select('*')
      .eq('id', id)
      .maybeSingle<Atendimento>();

    if (error || !data) {
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
          const previousState = this._atendimento()?.state ?? null;
          const next = payload.new as Atendimento;
          this._atendimento.set(next);

          if (previousState && previousState !== next.state) {
            this.notifications.notify(
              'HP suporte remoto',
              `Status: ${ATENDIMENTO_STATE_LABEL[next.state]}`,
              { tag: `atendimento:${next.id}` },
            );
          }
        },
      )
      .subscribe();
  }
}
