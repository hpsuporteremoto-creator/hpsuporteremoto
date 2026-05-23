import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FinanceiroService } from '../financeiro.service';
import { Transacao } from '../financeiro.types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
}

@Component({
  selector: 'hp-financeiro-list',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Financeiro</span>
      <span class="spacer"></span>
      <a
        mat-stroked-button
        routerLink="recebedor-pix"
        aria-label="Configurar recebedor PIX"
      >
        <mat-icon>qr_code_2</mat-icon>
        <span>Recebedor PIX</span>
      </a>
      <a mat-flat-button color="primary" routerLink="nova" aria-label="Nova transação">
        <mat-icon>add</mat-icon>
        <span>Nova transação</span>
      </a>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled" class="filter-card">
        <mat-card-content class="filter-content">
          <mat-form-field appearance="outline">
            <mat-label>De</mat-label>
            <input matInput type="date" [formControl]="fromControl" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Até</mat-label>
            <input matInput type="date" [formControl]="toControl" />
          </mat-form-field>
        </mat-card-content>
      </mat-card>

      <div class="resumo">
        <mat-card appearance="filled" class="resumo-card entrada">
          <mat-card-content>
            <small>Entradas</small>
            <strong>{{ resumo().entradas / 100 | currency }}</strong>
          </mat-card-content>
        </mat-card>
        <mat-card appearance="filled" class="resumo-card saida">
          <mat-card-content>
            <small>Saídas</small>
            <strong>{{ resumo().saidas / 100 | currency }}</strong>
          </mat-card-content>
        </mat-card>
        <mat-card
          appearance="filled"
          class="resumo-card saldo"
          [class.negativo]="resumo().saldo < 0"
        >
          <mat-card-content>
            <small>Saldo</small>
            <strong>{{ resumo().saldo / 100 | currency }}</strong>
          </mat-card-content>
        </mat-card>
      </div>

      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (transacoes(); as list) {
        @if (list.length === 0) {
          <p class="empty">Nenhuma transação no período.</p>
        } @else {
          <div class="list">
            @for (t of list; track t.id) {
              <mat-card
                class="transacao-card tipo-{{ t.tipo }}"
                appearance="filled"
              >
                <mat-card-content class="row">
                  <div class="info">
                    <strong class="descricao">{{ t.descricao }}</strong>
                    <small class="data">{{ t.data | date:'shortDate' }}</small>
                  </div>
                  <div class="valor-wrap">
                    <span class="valor">
                      {{ (t.tipo === 'entrada' ? '+' : '-') }}{{ t.valor_centavos / 100 | currency }}
                    </span>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="apagar(t)"
                      [disabled]="updating()"
                      aria-label="Apagar"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>
        }
      }
    </main>
  `,
  styleUrl: './financeiro-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinanceiroListPage {
  private readonly svc = inject(FinanceiroService);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fromControl = new FormControl(firstOfMonthISO(), {
    nonNullable: true,
  });
  protected readonly toControl = new FormControl(todayISO(), {
    nonNullable: true,
  });

  protected readonly transacoes = signal<Transacao[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly resumo = computed(() =>
    FinanceiroService.calcularResumo(this.transacoes() ?? []),
  );

  constructor() {
    this.fromControl.valueChanges.subscribe(() => void this.carregar());
    this.toControl.valueChanges.subscribe(() => void this.carregar());
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  async carregar(): Promise<void> {
    const from = this.fromControl.value;
    const to = this.toControl.value;
    if (!from || !to) return;

    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.svc.list(from, to);
      this.transacoes.set(data);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar transações',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async apagar(t: Transacao): Promise<void> {
    const ok = confirm(
      `Apagar "${t.descricao}"? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;

    this.updating.set(true);
    try {
      await this.svc.remove(t.id);
      this.transacoes.update((list) => list?.filter((x) => x.id !== t.id) ?? null);
      this.snackBar.open('Transação apagada', 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }
}
