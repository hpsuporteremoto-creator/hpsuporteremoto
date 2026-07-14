import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import { Transacao, TransacaoServicoRef } from '../financeiro.types';

function todayISO(): string {
  return localISODate(new Date());
}

function firstOfMonthISO(): string {
  const now = new Date();
  return localISODate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function localISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isISODate(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value);
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
      <a mat-stroked-button routerLink="recebedor-pix" aria-label="Configurar recebedor PIX">
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
              <mat-card class="transacao-card tipo-{{ t.tipo }}" appearance="filled">
                <mat-card-content class="row">
                  <div class="info">
                    @if (t.atendimento?.cliente; as cliente) {
                      <a
                        class="descricao cliente-link"
                        [routerLink]="['/admin/clientes', cliente.id, 'editar']"
                        [attr.aria-label]="'Editar cliente ' + cliente.nome"
                      >
                        {{ cliente.nome }}
                      </a>
                    } @else {
                      <strong class="descricao">{{ transacaoTitulo(t) }}</strong>
                    }
                    @let servicosComprados = transacaoServicos(t);
                    @if (servicosComprados.length > 0) {
                      <ul class="compras-list" aria-label="Itens comprados">
                        @for (servico of servicosComprados; track servico.id) {
                          <li>
                            <span class="item-name">
                              @if (servico.quantidade > 1) {
                                <strong>{{ servico.quantidade }}x</strong>
                              }
                              {{ servico.nome }}
                            </span>
                            <span class="item-value">
                              {{ servico.subtotal_centavos / 100 | currency }}
                            </span>
                          </li>
                        }
                      </ul>
                    }
                    @if (transacaoDetalhe(t); as detalhe) {
                      <small class="detalhe">{{ detalhe }}</small>
                    }
                    @if (t.atendimento?.vendido_por; as vendedor) {
                      <small class="detalhe">Vendido por {{ operadorLabel(vendedor) }}</small>
                    }
                    <small class="data">{{ t.data | date: 'shortDate' }}</small>
                  </div>
                  <div class="valor-wrap">
                    <span class="valor">
                      {{ t.tipo === 'entrada' ? '+' : '-' }}{{ t.valor_centavos / 100 | currency }}
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
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly fromControl = new FormControl(this.initialDate('from', firstOfMonthISO()), {
    nonNullable: true,
  });
  protected readonly toControl = new FormControl(this.initialDate('to', todayISO()), {
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
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar transações');
    } finally {
      this.loading.set(false);
    }
  }

  async apagar(t: Transacao): Promise<void> {
    const ok = confirm(`Apagar "${this.transacaoTitulo(t)}"? Esta ação não pode ser desfeita.`);
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

  protected transacaoTitulo(t: Transacao): string {
    return t.atendimento?.cliente?.nome?.trim() || t.descricao;
  }

  protected transacaoServicos(t: Transacao): TransacaoServicoRef[] {
    return t.atendimento?.servicos_solicitados ?? [];
  }

  protected transacaoDetalhe(t: Transacao): string | null {
    if (!t.atendimento_id || t.descricao === this.transacaoTitulo(t)) return null;
    return t.descricao;
  }

  protected operadorLabel(operador: NonNullable<Transacao['atendimento']>['vendido_por']): string {
    return operador?.full_name?.trim() || operador?.email || 'usuário';
  }

  private initialDate(param: 'from' | 'to', fallback: string): string {
    const value = this.route.snapshot.queryParamMap.get(param);
    return isISODate(value) ? value : fallback;
  }
}
