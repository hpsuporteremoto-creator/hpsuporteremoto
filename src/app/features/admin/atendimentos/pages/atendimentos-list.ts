import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { NotificationService } from '../../../../core/notifications/notification.service';
import { AtendimentosService } from '../atendimentos.service';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoComRelacoes,
  AtendimentoListFilter,
  AtendimentoState,
} from '../atendimentos.types';

const TAB_TO_FILTER: ReadonlyArray<AtendimentoListFilter> = [
  'em-andamento',
  'pagamento',
  'concluido',
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
      @if (notifications.canRequest()) {
        <button
          mat-icon-button
          type="button"
          (click)="ativarNotificacoes()"
          aria-label="Ativar notificações"
          title="Ativar notificações"
        >
          <mat-icon>notifications</mat-icon>
        </button>
      }
    </mat-toolbar>

    <mat-tab-group
      [selectedIndex]="tabIndex()"
      (selectedIndexChange)="onTabChange($event)"
      mat-stretch-tabs="false"
      animationDuration="0ms"
    >
      <mat-tab label="Em andamento" />
      <mat-tab label="Pagamento" />
      <mat-tab label="Concluídos" />
    </mat-tab-group>

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
                        {{ a.cliente.whatsapp }} · RustDesk {{ a.rustdesk_id }}
                      </small>
                      <small class="meta">
                        {{ a.created_at | date:'short' }}
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
  private readonly location = inject(Location);
  protected readonly notifications = inject(NotificationService);

  protected readonly atendimentos = signal<AtendimentoComRelacoes[] | null>(
    null,
  );
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tabIndex = signal(0);

  protected readonly emptyMessage = computed(() => {
    switch (TAB_TO_FILTER[this.tabIndex()]) {
      case 'em-andamento':
        return 'Nenhum atendimento em andamento.';
      case 'pagamento':
        return 'Nenhum atendimento aguardando pagamento.';
      case 'concluido':
        return 'Nenhum atendimento concluído ainda.';
      default:
        return 'Nada por aqui.';
    }
  });

  constructor() {
    this.svc.resetNewCount();
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  onTabChange(index: number): void {
    this.tabIndex.set(index);
    void this.carregar();
  }

  stateLabel(state: AtendimentoState): string {
    return ATENDIMENTO_STATE_LABEL[state];
  }

  async ativarNotificacoes(): Promise<void> {
    await this.notifications.requestPermission();
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.svc.list(TAB_TO_FILTER[this.tabIndex()]);
      this.atendimentos.set(data);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar atendimentos',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
