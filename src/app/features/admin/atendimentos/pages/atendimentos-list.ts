import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ClientesService } from '../../clientes/clientes.service';
import { AtendimentosService } from '../atendimentos.service';
import { NovoAtendimentoDialog } from './novo-atendimento-dialog';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoComRelacoes,
  AtendimentoListFilter,
  AtendimentoState,
} from '../atendimentos.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';

const TAB_TO_FILTER: ReadonlyArray<AtendimentoListFilter> = [
  'novos',
  'em_andamento',
  'pagamento',
  'concluido',
  'recusado',
];

@Component({
  selector: 'hp-atendimentos-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatTabsModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Atendimentos</span>
      <span class="spacer"></span>
      @if (clienteFilterId()) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          (click)="abrirNovoAtendimento()"
          [attr.aria-label]="novoAtendimentoLabel()"
          [title]="novoAtendimentoLabel()"
        >
          <mat-icon>add</mat-icon>
          <span>Novo pedido</span>
        </button>
      } @else {
        <a
          mat-flat-button
          color="primary"
          routerLink="/admin/clientes"
          [attr.aria-label]="novoAtendimentoLabel()"
          [title]="novoAtendimentoLabel()"
        >
          <mat-icon>add</mat-icon>
          <span>Buscar cliente</span>
        </a>
      }
    </mat-toolbar>

    @if (clienteFilterId()) {
      <section class="client-filter" aria-live="polite">
        <div>
          <span class="filter-label">Cliente selecionado</span>
          <strong>{{ clienteFilterName() }}</strong>
        </div>
        <div class="client-filter-actions">
          @if (whatsappLink(); as link) {
            <a
              mat-flat-button
              color="primary"
              [href]="link"
              target="_blank"
              rel="noopener"
              aria-label="Falar com cliente pelo WhatsApp"
            >
              <mat-icon>chat</mat-icon>
              <span>WhatsApp</span>
            </a>
          }
          <a mat-stroked-button routerLink="/admin/clientes">Trocar cliente</a>
        </div>
      </section>
    } @else {
      <mat-tab-group
        [selectedIndex]="tabIndex()"
        (selectedIndexChange)="onTabChange($event)"
        mat-stretch-tabs="false"
        animationDuration="0ms"
      >
        <mat-tab label="Novos" />
        <mat-tab label="Em atendimento" />
        <mat-tab label="Pagamento" />
        <mat-tab label="Concluídos" />
        <mat-tab label="Recusados" />
      </mat-tab-group>
    }

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (atendimentos(); as list) {
        @if (list.length === 0) {
          <p class="empty">{{ emptyMessage() }}</p>
        } @else {
          <div class="list">
            @for (a of list; track a.id) {
              <a [routerLink]="[a.id]" class="card-link">
                <mat-card class="atendimento-card" appearance="filled">
                  <mat-card-content class="row">
                    <div class="info">
                      <strong class="cliente">{{ a.cliente.nome }}</strong>
                      <small class="meta">
                        {{ formatWhatsapp(a.cliente.whatsapp) }}
                        @if (a.rustdesk_id) {
                          · RustDesk {{ a.rustdesk_id }}
                        }
                      </small>
                      @if (a.servicos_solicitados.length > 0) {
                        <small class="meta">
                          {{ servicosLabel(a.servicos_solicitados) }}
                        </small>
                      }
                      <small class="meta">
                        {{ a.created_at | date: 'short' }}
                      </small>
                    </div>
                    <span class="state-badge state-{{ a.state }}">
                      {{ stateLabel(a.state) }}
                    </span>
                  </mat-card-content>
                </mat-card>
              </a>
            }
          </div>
        }
      }
    </main>
  `,
  styleUrl: './atendimentos-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtendimentosListPage {
  private readonly svc = inject(AtendimentosService);
  private readonly clientesSvc = inject(ClientesService);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  protected readonly atendimentos = signal<AtendimentoComRelacoes[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tabIndex = signal(0);
  protected readonly clienteFilterId = signal<string | null>(null);
  protected readonly clienteFilterName = signal('cliente selecionado');
  protected readonly clienteWhatsapp = signal<string | null>(null);
  protected readonly formatWhatsapp = formatWhatsappDisplay;
  // `clienteWhatsapp` já é canônico (digits-only com DDI) após a migration 0013.
  protected readonly whatsappLink = computed(() => {
    const whats = this.clienteWhatsapp();
    return whats ? `https://wa.me/${whats}` : null;
  });
  protected readonly novoAtendimentoLabel = computed(() =>
    this.clienteFilterId()
      ? `Novo pedido para ${this.clienteFilterName()}`
      : 'Buscar cliente ativo',
  );

  protected readonly emptyMessage = computed(() => {
    if (this.clienteFilterId()) {
      return 'Nenhum atendimento encontrado para este cliente.';
    }

    switch (TAB_TO_FILTER[this.tabIndex()]) {
      case 'novos':
        return 'Nenhuma solicitação nova.';
      case 'em_andamento':
        return 'Nenhum atendimento em execução.';
      case 'pagamento':
        return 'Nenhum atendimento aguardando pagamento.';
      case 'concluido':
        return 'Nenhum atendimento concluído ainda.';
      case 'recusado':
        return 'Nenhum atendimento recusado.';
      default:
        return 'Nada por aqui.';
    }
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.clienteFilterId.set(params.get('clienteId'));
    this.clienteFilterName.set(params.get('clienteNome') ?? 'cliente selecionado');
    void this.carregarClienteSelecionado();
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  abrirNovoAtendimento(): void {
    const clienteId = this.clienteFilterId();
    if (!clienteId) return;

    const ref = this.dialog.open<
      NovoAtendimentoDialog,
      { clienteId: string; clienteNome: string },
      string
    >(NovoAtendimentoDialog, {
      width: '480px',
      data: { clienteId, clienteNome: this.clienteFilterName() },
    });

    ref.afterClosed().subscribe((id) => {
      if (id) {
        void this.router.navigate(['/admin/atendimentos', id]);
      }
    });
  }

  onTabChange(index: number): void {
    this.tabIndex.set(index);
    void this.carregar();
  }

  stateLabel(state: AtendimentoState): string {
    return ATENDIMENTO_STATE_LABEL[state];
  }

  servicosLabel(servicos: AtendimentoComRelacoes['servicos_solicitados']): string {
    return servicos.map((servico) => servico.nome).join(', ');
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.svc.list(TAB_TO_FILTER[this.tabIndex()], {
        clienteId: this.clienteFilterId() ?? undefined,
        todosOsStatus: Boolean(this.clienteFilterId()),
      });
      this.atendimentos.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar atendimentos');
    } finally {
      this.loading.set(false);
    }
  }

  private async carregarClienteSelecionado(): Promise<void> {
    const clienteId = this.clienteFilterId();
    if (!clienteId) return;

    try {
      const cliente = await this.clientesSvc.get(clienteId);
      if (!cliente) return;
      this.clienteFilterName.set(cliente.nome);
      this.clienteWhatsapp.set(cliente.whatsapp);
    } catch {
      this.clienteWhatsapp.set(null);
    }
  }
}
