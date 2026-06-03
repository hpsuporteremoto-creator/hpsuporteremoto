import { DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ContratosService } from '../contratos.service';
import {
  CONTRATO_STATUS_OPTIONS,
  Contrato,
  ContratoStatus,
  toContratoStatusLabel,
} from '../contratos.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';

type StatusFilter = ContratoStatus | 'todos';

@Component({
  selector: 'hp-contratos-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatProgressBarModule,
    MatSelectModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Contratos</span>
      <span class="spacer"></span>
      <a mat-flat-button color="primary" routerLink="novo" aria-label="Novo contrato">
        <mat-icon>add</mat-icon>
        <span>Novo contrato</span>
      </a>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      <section class="filters" aria-label="Filtros de contratos">
        <mat-form-field appearance="outline">
          <mat-label>Status</mat-label>
          <mat-select [value]="statusFilter()" (selectionChange)="onStatusChange($event.value)">
            <mat-option value="todos">Todos</mat-option>
            @for (status of statusOptions; track status.value) {
              <mat-option [value]="status.value">{{ status.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <p aria-live="polite">{{ contratos().length }} contrato(s) encontrado(s)</p>
      </section>

      @if (contratos().length === 0 && !loading()) {
        <p class="empty">Nenhum contrato encontrado para este status.</p>
      } @else {
        <div class="list">
          @for (contrato of contratos(); track contrato.id) {
            <mat-card appearance="filled" class="contrato-card">
              <mat-card-content class="row">
                <div class="info">
                  <strong>{{ contrato.cliente.nome }}</strong>
                  <small>{{ formatWhatsapp(contrato.cliente.whatsapp) }}</small>
                  @if (contrato.cliente.email) {
                    <small>{{ contrato.cliente.email }}</small>
                  }
                  <small>{{ contrato.created_at | date: 'short' }}</small>
                  <p>{{ contrato.objeto }}</p>
                </div>
                <span class="status-badge status-{{ contrato.status }}">
                  {{ statusLabel(contrato.status) }}
                </span>
              </mat-card-content>
            </mat-card>
          }
        </div>
      }
    </main>
  `,
  styleUrl: './contratos-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContratosListPage {
  private readonly contratosService = inject(ContratosService);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly formatWhatsapp = formatWhatsappDisplay;
  protected readonly statusOptions = CONTRATO_STATUS_OPTIONS;
  protected readonly statusFilter = signal<StatusFilter>('todos');
  protected readonly contratos = signal<Contrato[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    const status = this.route.snapshot.queryParamMap.get('status');
    this.statusFilter.set(isStatusFilter(status) ? status : 'todos');
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  onStatusChange(status: StatusFilter): void {
    this.statusFilter.set(status);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: status === 'todos' ? {} : { status },
      replaceUrl: true,
    });
    void this.carregar();
  }

  statusLabel(status: ContratoStatus): string {
    return toContratoStatusLabel(status);
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.contratos.set(await this.contratosService.list(this.statusFilter()));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar contratos');
    } finally {
      this.loading.set(false);
    }
  }
}

function isStatusFilter(value: string | null): value is StatusFilter {
  if (value === 'todos') return true;
  return CONTRATO_STATUS_OPTIONS.some((option) => option.value === value);
}
