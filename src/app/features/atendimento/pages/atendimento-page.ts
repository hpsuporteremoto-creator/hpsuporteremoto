import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FunilStepper, FunilStepKey } from '../../../shared/funil-stepper';
import { ServicosService } from '../../admin/servicos/servicos.service';
import { Servico } from '../../admin/servicos/servicos.types';
import { AtendimentoService } from '../atendimento.service';
import { ConexaoForm } from '../components/conexao-form';
import { CredenciaisRustDesk } from '../components/credenciais-rustdesk';
import { EmAtendimento } from '../components/em-atendimento';
import { Liquidacao } from '../components/liquidacao';
import { Vitrine } from '../components/vitrine';
import { WhatsappStep } from '../components/whatsapp-step';
import { ClienteLookupResult, ConexaoFormData } from '../atendimento.types';

type EtapaParam = 'servicos' | 'whatsapp' | 'solicitacao' | 'credenciais' | 'atendimento';

const ETAPAS: ReadonlySet<string> = new Set([
  'servicos',
  'whatsapp',
  'solicitacao',
  'credenciais',
  'atendimento',
]);

@Component({
  selector: 'hp-atendimento-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    FunilStepper,
    Vitrine,
    WhatsappStep,
    ConexaoForm,
    CredenciaisRustDesk,
    EmAtendimento,
    Liquidacao,
  ],
  template: `
    <a
      routerLink="/login"
      mat-icon-button
      class="admin-link"
      aria-label="Acesso admin"
      title="Acesso admin"
    >
      <mat-icon>lock</mat-icon>
    </a>

    <main class="page">
      <mat-card class="atendimento-card" appearance="filled">
        <div class="stepper-wrap">
          <hp-funil-stepper [currentStep]="stepperStep()" />
        </div>

        @if (svc.state() === null) {
          @switch (clientStep()) {
            @case ('servicos') {
              <hp-vitrine (selected)="onServicosSelected($event)" />
            }
            @case ('whatsapp') {
              @if (svc.selectedServicos().length > 0) {
                <hp-whatsapp-step
                  [whatsapp]="whatsappParam()"
                  (back)="voltarParaVitrine()"
                  (lookedUp)="onWhatsappLookedUp($event)"
                />
              } @else {
                <div class="status">
                  <mat-icon class="wait-glyph">design_services</mat-icon>
                  <h1>Carregando serviços</h1>
                  <p>Estamos buscando os serviços escolhidos pela URL.</p>
                </div>
              }
            }
            @case ('solicitacao') {
              @if (svc.selectedServicos().length > 0 && svc.lookup()) {
                <hp-conexao-form
                  [preFill]="svc.lookup()"
                  [servicos]="svc.selectedServicos()"
                  (back)="voltarParaWhatsapp()"
                  (backToVitrine)="voltarParaVitrine()"
                  (drafted)="onSolicitacaoDrafted($event)"
                />
              } @else if (lookupLoading()) {
                <div class="status">
                  <mat-icon class="wait-glyph">chat</mat-icon>
                  <h1>Consultando WhatsApp</h1>
                  <p>Vamos verificar se você já está na base.</p>
                </div>
              } @else {
                <hp-whatsapp-step
                  [whatsapp]="whatsappParam()"
                  (back)="voltarParaVitrine()"
                  (lookedUp)="onWhatsappLookedUp($event)"
                />
              }
            }
            @case ('credenciais') {
              @if (svc.draft(); as draft) {
                <hp-credenciais-rustdesk
                  [draft]="draft"
                  (back)="voltarParaSolicitacao()"
                  (created)="onCreated($event)"
                />
              } @else {
                <div class="status">
                  <mat-icon class="wait-glyph">edit_note</mat-icon>
                  <h1>Solicitação incompleta</h1>
                  <p>Preencha os dados da solicitação antes de enviar o pedido para atendimento.</p>
                  <button mat-stroked-button type="button" (click)="voltarParaSolicitacao()">
                    Voltar para solicitação
                  </button>
                </div>
              }
            }
            @case ('atendimento') {
              <div class="status status-aguardando">
                <mat-icon class="wait-glyph">hourglass_empty</mat-icon>
                <h1>Carregando atendimento</h1>
                <p>Estamos conectando esta tela ao status em tempo real.</p>
              </div>
            }
          }
        } @else {
          @switch (svc.state()) {
            @case ('aguardando_confirmacao') {
              <div class="status status-aguardando">
                <mat-icon class="wait-glyph">hourglass_empty</mat-icon>
                <h1>Solicitação enviada</h1>
                <p>
                  O pedido chegou para o admin em tempo real. Aguarde o aceite para iniciar o
                  atendimento.
                </p>
                <p class="hint">Se informou RustDesk, mantenha o aplicativo aberto.</p>
              </div>
            }
            @case ('recusado') {
              <div class="status status-recusado">
                <mat-icon class="cancel">cancel</mat-icon>
                <h1>Atendimento recusado</h1>
                <p>
                  Não conseguimos aceitar esta solicitação agora. Fale conosco pelo WhatsApp para
                  combinar o melhor caminho.
                </p>
                <button mat-stroked-button type="button" (click)="novoAtendimento()">
                  Nova solicitação
                </button>
              </div>
            }
            @case ('em_andamento') {
              <hp-em-atendimento />
            }
            @case ('pagamento') {
              @if (svc.atendimento(); as atendimento) {
                <hp-liquidacao [atendimento]="atendimento" />
              }
            }
            @case ('concluido') {
              <div class="status status-concluido">
                <mat-icon class="check">check_circle</mat-icon>
                <h1>Atendimento concluído</h1>
                <p>Obrigado pela confiança! Você pode fechar esta janela.</p>
                <button mat-stroked-button type="button" (click)="novoAtendimento()">
                  Novo atendimento
                </button>
              </div>
            }
          }
        }
      </mat-card>

      @if (notifications.canRequest()) {
        <button
          mat-stroked-button
          class="enable-notifs"
          type="button"
          (click)="ativarNotificacoes()"
        >
          <mat-icon>notifications</mat-icon>
          <span>Ativar notificações de status</span>
        </button>
      }
    </main>
  `,
  styleUrl: './atendimento-page.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtendimentoPage {
  protected readonly svc = inject(AtendimentoService);
  protected readonly notifications = inject(NotificationService);
  private readonly servicosSvc = inject(ServicosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private loadingServicosKey: string | null = null;
  private loadingWhatsapp: string | null = null;

  protected readonly lookupLoading = signal(false);

  private readonly queryParamMap = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly etapaParam = computed<EtapaParam>(() =>
    parseEtapa(this.queryParamMap().get('etapa')),
  );
  protected readonly servicosParam = computed(() => {
    const query = this.queryParamMap();
    return query.get('servicos') ?? query.get('servico');
  });
  protected readonly servicoIdsParam = computed(() => parseServicoIds(this.servicosParam()));
  protected readonly whatsappParam = computed(() => this.queryParamMap().get('whatsapp'));
  protected readonly atendimentoIdParam = computed(() => this.queryParamMap().get('atendimento'));

  protected readonly clientStep = computed<EtapaParam>(() => {
    const etapa = this.etapaParam();
    if (etapa === 'atendimento') return etapa;
    if (this.servicoIdsParam().length === 0 && this.svc.selectedServicos().length === 0) {
      return 'servicos';
    }
    return etapa;
  });

  protected readonly stepperStep = computed<FunilStepKey>(() => {
    const state = this.svc.state();
    if (state) return state;
    const step = this.clientStep();
    return step === 'atendimento' ? 'atendimento' : step;
  });

  constructor() {
    effect(() => {
      const ids = this.servicoIdsParam();
      const key = ids.join(',');
      const selectedIds = this.svc
        .selectedServicos()
        .map((servico) => servico.id)
        .join(',');
      if (!key || selectedIds === key || this.loadingServicosKey === key) return;
      void this.carregarServicos(ids, key);
    });

    effect(() => {
      const whatsapp = this.whatsappParam();
      const etapa = this.etapaParam();
      const lookup = this.svc.lookup();
      if (
        !whatsapp ||
        etapa === 'whatsapp' ||
        lookup?.whatsapp === whatsapp ||
        this.loadingWhatsapp === whatsapp
      ) {
        return;
      }
      void this.consultarWhatsappParam(whatsapp);
    });

    effect(() => {
      const id = this.atendimentoIdParam();
      const atendimento = this.svc.atendimento();
      if (!id || atendimento?.id === id) return;
      void this.svc.acompanhar(id);
    });

    effect(() => {
      const atendimento = this.svc.atendimento();
      if (!atendimento || this.atendimentoIdParam() === atendimento.id) return;
      this.navegar({
        etapa: 'atendimento',
        atendimento: atendimento.id,
      });
    });
  }

  onServicosSelected(servicos: Servico[]): void {
    this.svc.selecionarServicos(servicos);
    this.navegar({
      etapa: 'whatsapp',
      servicos: servicos.map((servico) => servico.id).join(','),
      servico: null,
      whatsapp: null,
      atendimento: null,
    });
  }

  onWhatsappLookedUp(result: ClienteLookupResult): void {
    this.navegar({
      etapa: 'solicitacao',
      whatsapp: result.whatsapp,
      atendimento: null,
    });
  }

  onSolicitacaoDrafted(data: ConexaoFormData): void {
    this.svc.salvarSolicitacao(data);
    this.navegar({ etapa: 'credenciais' });
  }

  onCreated(id: string): void {
    this.navegar({
      etapa: 'atendimento',
      atendimento: id,
    });
  }

  async ativarNotificacoes(): Promise<void> {
    await this.notifications.requestPermission();
  }

  voltarParaVitrine(): void {
    this.svc.voltarParaVitrine();
    this.navegar({
      etapa: 'servicos',
      servicos: null,
      servico: null,
      whatsapp: null,
      atendimento: null,
    });
  }

  voltarParaWhatsapp(): void {
    this.svc.voltarParaWhatsapp();
    this.svc.limparDraft();
    this.navegar({
      etapa: 'whatsapp',
      whatsapp: null,
      atendimento: null,
    });
  }

  voltarParaSolicitacao(): void {
    this.navegar({
      etapa: 'solicitacao',
      atendimento: null,
    });
  }

  novoAtendimento(): void {
    this.svc.limpar();
    this.navegar({
      etapa: 'servicos',
      servicos: null,
      servico: null,
      whatsapp: null,
      atendimento: null,
    });
  }

  private async carregarServicos(ids: readonly string[], key: string): Promise<void> {
    this.loadingServicosKey = key;
    try {
      const servicos = await this.servicosSvc.getMany(ids);
      if (servicos.length > 0) {
        this.svc.selecionarServicos(servicos);
      } else {
        this.voltarParaVitrine();
      }
    } finally {
      this.loadingServicosKey = null;
    }
  }

  private async consultarWhatsappParam(whatsapp: string): Promise<void> {
    this.loadingWhatsapp = whatsapp;
    this.lookupLoading.set(true);
    try {
      await this.svc.lookupPorWhatsapp(whatsapp);
    } finally {
      this.loadingWhatsapp = null;
      this.lookupLoading.set(false);
    }
  }

  private navegar(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
    });
  }
}

function parseEtapa(value: string | null): EtapaParam {
  if (value && ETAPAS.has(value)) return value as EtapaParam;
  return 'servicos';
}

function parseServicoIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id, index, ids) => id.length > 0 && ids.indexOf(id) === index);
}
