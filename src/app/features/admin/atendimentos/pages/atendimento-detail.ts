import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AtendimentosService } from '../atendimentos.service';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoComRelacoes,
  AtendimentoState,
} from '../atendimentos.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';

@Component({
  selector: 'hp-atendimento-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
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
      <span class="title">Atendimento</span>
      <span class="spacer"></span>
      @if (atendimento(); as a) {
        <span class="state-badge state-{{ a.state }}">
          {{ stateLabel(a.state) }}
        </span>
      }
    </mat-toolbar>

    @if (loading() || updating()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (atendimento(); as a) {
        <mat-card appearance="filled" class="info-card">
          <mat-card-header>
            <mat-card-title>{{ a.cliente.nome }}</mat-card-title>
          </mat-card-header>
          <mat-card-content class="cliente-content">
            <p>
              <mat-icon>chat</mat-icon>
              <a [href]="'https://wa.me/' + a.cliente.whatsapp" target="_blank" rel="noopener">{{
                formatWhatsapp(a.cliente.whatsapp)
              }}</a>
            </p>
            @if (a.cliente.email) {
              <p><mat-icon>mail</mat-icon> {{ a.cliente.email }}</p>
            }
            @if (a.cliente.instagram) {
              <p><mat-icon>tag</mat-icon> &#64;{{ a.cliente.instagram }}</p>
            }
            <p class="meta">
              <mat-icon>schedule</mat-icon>
              Solicitado em {{ a.created_at | date: 'short' }}
            </p>
          </mat-card-content>
        </mat-card>

        @if (a.descricao_solicitacao || a.servicos_solicitados.length > 0 || a.servico) {
          <mat-card appearance="filled" class="info-card">
            <mat-card-header>
              <mat-card-title>Solicitação</mat-card-title>
            </mat-card-header>
            <mat-card-content class="solicitacao-content">
              @if (a.servicos_solicitados.length > 0) {
                @for (s of a.servicos_solicitados; track s.id) {
                  <div class="servico-pill">
                    <mat-icon>design_services</mat-icon>
                    <span class="servico-nome">{{ s.nome }}</span>
                    <span class="servico-valor">
                      {{ s.valor_centavos / 100 | currency }}
                    </span>
                  </div>
                }
              } @else if (a.servico; as s) {
                <div class="servico-pill">
                  <mat-icon>design_services</mat-icon>
                  <span class="servico-nome">{{ s.nome }}</span>
                  <span class="servico-valor">
                    {{ s.valor_centavos / 100 | currency }}
                  </span>
                </div>
              }
              @if (a.descricao_solicitacao) {
                <p class="descricao">{{ a.descricao_solicitacao }}</p>
              }
            </mat-card-content>
          </mat-card>
        }

        <mat-card appearance="filled" class="info-card">
          <mat-card-content class="state-content">
            @switch (a.state) {
              @case ('em_andamento') {
                <p class="state-hint">
                  Atendimento em execução. Ao terminar, confirme o serviço para gerar o PIX e enviar
                  o atendimento para pagamento.
                </p>

                @if (servicosParaCobranca().length > 0) {
                  <section class="checkout" aria-label="Serviços para cobrança">
                    <div class="checkout-header">
                      <span>Serviços do atendimento</span>
                      <small>{{ servicosParaCobranca().length }} serviço(s)</small>
                    </div>
                    <ul class="checkout-list">
                      @for (servico of servicosParaCobranca(); track servico.id) {
                        <li>
                          <span>{{ servico.nome }}</span>
                          <strong>{{ servico.valor_centavos / 100 | currency }}</strong>
                        </li>
                      }
                    </ul>
                    <mat-form-field appearance="outline" class="discount-field">
                      <mat-label>Desconto</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        step="0.01"
                        inputmode="decimal"
                        [value]="descontoParaCobranca() / 100"
                        (input)="onDescontoChange($event)"
                        [disabled]="updating()"
                      />
                      <span matTextPrefix>R$&nbsp;</span>
                    </mat-form-field>
                    <div class="checkout-summary">
                      <div>
                        <span>Subtotal</span>
                        <strong>{{ subtotalParaCobranca() / 100 | currency }}</strong>
                      </div>
                      @if (descontoParaCobranca() > 0) {
                        <div class="discount-line">
                          <span>Desconto</span>
                          <strong>-{{ descontoParaCobranca() / 100 | currency }}</strong>
                        </div>
                      }
                    </div>
                    @if (descontoInvalido()) {
                      <p class="discount-error" role="alert">
                        O desconto precisa ser menor que o subtotal.
                      </p>
                    }
                    <div class="checkout-total">
                      <span>Total da cobrança</span>
                      <strong>{{ totalParaCobranca() / 100 | currency }}</strong>
                    </div>
                  </section>
                } @else {
                  <p class="state-hint">
                    Este atendimento não tem serviços selecionados para cobrança.
                  </p>
                }

                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="cobrarEFinalizar()"
                  [disabled]="
                    servicosParaCobranca().length === 0 ||
                    descontoInvalido() ||
                    totalParaCobranca() <= 0 ||
                    updating()
                  "
                >
                  <mat-icon>qr_code_2</mat-icon>
                  <span>Finalizar e cobrar {{ totalParaCobranca() / 100 | currency }}</span>
                </button>
              }
              @case ('pagamento') {
                <p class="state-hint">
                  PIX gerado. Se o valor for renegociado, ajuste o desconto e atualize o PIX antes
                  de marcar como pago.
                </p>

                @if (servicosParaCobranca().length > 0) {
                  <section class="checkout" aria-label="Cobrança para pagamento">
                    <div class="checkout-header">
                      <span>Cobrança atual</span>
                      <small>{{ servicosParaCobranca().length }} serviço(s)</small>
                    </div>
                    <ul class="checkout-list">
                      @for (servico of servicosParaCobranca(); track servico.id) {
                        <li>
                          <span>{{ servico.nome }}</span>
                          <strong>{{ servico.valor_centavos / 100 | currency }}</strong>
                        </li>
                      }
                    </ul>
                    <mat-form-field appearance="outline" class="discount-field">
                      <mat-label>Desconto</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        step="0.01"
                        inputmode="decimal"
                        [value]="descontoParaCobranca() / 100"
                        (input)="onDescontoChange($event)"
                        [disabled]="updating()"
                      />
                      <span matTextPrefix>R$&nbsp;</span>
                    </mat-form-field>
                    <div class="checkout-summary">
                      <div>
                        <span>Subtotal</span>
                        <strong>{{ subtotalParaCobranca() / 100 | currency }}</strong>
                      </div>
                      @if (descontoParaCobranca() > 0) {
                        <div class="discount-line">
                          <span>Desconto</span>
                          <strong>-{{ descontoParaCobranca() / 100 | currency }}</strong>
                        </div>
                      }
                    </div>
                    @if (descontoInvalido()) {
                      <p class="discount-error" role="alert">
                        O desconto precisa ser menor que o subtotal.
                      </p>
                    }
                    <div class="checkout-total">
                      <span>Total da cobrança</span>
                      <strong>{{ totalParaCobranca() / 100 | currency }}</strong>
                    </div>
                  </section>
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="atualizarPix()"
                    [disabled]="descontoInvalido() || totalParaCobranca() <= 0 || updating()"
                  >
                    <mat-icon>qr_code_2</mat-icon>
                    <span>Atualizar PIX {{ totalParaCobranca() / 100 | currency }}</span>
                  </button>
                  @if (descontoAlterado()) {
                    <p class="discount-warning" role="status">
                      Atualize o PIX para aplicar o desconto antes de finalizar.
                    </p>
                  }
                } @else if (a.valor_centavos !== null) {
                  <p class="valor">{{ a.valor_centavos / 100 | currency }}</p>
                }
                @if (a.pix_brcode; as brcode) {
                  <div class="brcode-block">
                    <small>BR Code</small>
                    <code class="brcode">{{ brcode }}</code>
                    <button
                      mat-stroked-button
                      type="button"
                      (click)="copiar(brcode, 'BR Code copiado')"
                    >
                      <mat-icon>content_copy</mat-icon>
                      <span>Copiar BR Code</span>
                    </button>
                  </div>
                }
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="marcarPago()"
                  [disabled]="updating() || descontoAlterado() || descontoInvalido()"
                >
                  <mat-icon>check_circle</mat-icon>
                  <span>Marcar como pago e finalizar</span>
                </button>
              }
              @case ('concluido') {
                <p class="state-hint">Atendimento concluído.</p>
                @if (a.valor_centavos !== null) {
                  <p class="valor">{{ a.valor_centavos / 100 | currency }}</p>
                }
                <p class="meta">Finalizado em {{ a.updated_at | date: 'short' }}</p>
              }
              @case ('recusado') {
                <p class="state-hint">Atendimento recusado.</p>
                <p class="meta">Atualizado em {{ a.updated_at | date: 'short' }}</p>
              }
            }
          </mat-card-content>
        </mat-card>
      }
    </main>
  `,
  styleUrl: './atendimento-detail.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtendimentoDetailPage {
  private readonly svc = inject(AtendimentosService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly atendimento = signal<AtendimentoComRelacoes | null>(null);
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly descontoCentavos = signal(0);

  protected readonly servicosParaCobranca = computed(() => {
    const atendimento = this.atendimento();
    if (!atendimento) return [];
    if (atendimento.servicos_solicitados.length > 0) {
      return atendimento.servicos_solicitados;
    }
    return atendimento.servico ? [atendimento.servico] : [];
  });
  protected readonly subtotalParaCobranca = computed(() => {
    return this.servicosParaCobranca().reduce(
      (total, servico) => total + servico.valor_centavos,
      0,
    );
  });
  protected readonly descontoParaCobranca = computed(() => Math.max(this.descontoCentavos(), 0));
  protected readonly descontoInvalido = computed(
    () =>
      this.servicosParaCobranca().length > 0 &&
      this.descontoParaCobranca() >= this.subtotalParaCobranca(),
  );
  protected readonly totalParaCobranca = computed(() =>
    Math.max(this.subtotalParaCobranca() - this.descontoParaCobranca(), 0),
  );
  protected readonly descontoAlterado = computed(
    () => this.descontoParaCobranca() !== (this.atendimento()?.desconto_centavos ?? 0),
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.carregar(id);
    }
  }

  voltar(): void {
    this.location.back();
  }

  stateLabel(state: AtendimentoState): string {
    return ATENDIMENTO_STATE_LABEL[state];
  }

  protected readonly formatWhatsapp = formatWhatsappDisplay;

  async copiar(text: string, msg: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.snackBar.open(msg, 'OK', { duration: 2000 });
    } catch {
      this.snackBar.open('Não foi possível copiar', 'OK', { duration: 2000 });
    }
  }

  async carregar(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const a = await this.svc.get(id);
      this.atendimento.set(a);
      this.descontoCentavos.set(Math.max(a?.desconto_centavos ?? 0, 0));
      if (!a) {
        this.error.set('Atendimento não encontrado');
        return;
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar');
    } finally {
      this.loading.set(false);
    }
  }

  onDescontoChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const value = Number(input?.value ?? 0);
    const desconto = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.descontoCentavos.set(Math.round(desconto * 100));
  }

  async cobrarEFinalizar(): Promise<void> {
    await this.gerarPix('PIX gerado para cobrança.');
  }

  async atualizarPix(): Promise<void> {
    await this.gerarPix('PIX atualizado.');
  }

  private async gerarPix(successMessage: string): Promise<void> {
    const a = this.atendimento();
    const servicoIds = this.servicosParaCobranca().map((servico) => servico.id);
    if (!a || servicoIds.length === 0 || this.descontoInvalido() || this.totalParaCobranca() <= 0) {
      return;
    }

    this.updating.set(true);
    try {
      await this.svc.cobrarEFinalizar(a.id, servicoIds, this.descontoParaCobranca());
      this.snackBar.open(successMessage, 'OK', { duration: 3000 });
      await this.carregar(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar PIX';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  async marcarPago(): Promise<void> {
    const a = this.atendimento();
    if (!a) return;
    await this.transition(a.id, 'concluido');
  }

  private async transition(id: string, state: AtendimentoState): Promise<void> {
    this.updating.set(true);
    try {
      await this.svc.updateState(id, state);
      await this.carregar(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }
}
