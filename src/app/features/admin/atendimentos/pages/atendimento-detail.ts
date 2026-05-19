import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AtendimentosService } from '../atendimentos.service';
import {
  AtendimentoComRelacoes,
  AtendimentoState,
} from '../atendimentos.types';
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';

const STATE_LABEL: Readonly<Record<AtendimentoState, string>> = {
  conexao: 'Conexão',
  em_atendimento: 'Em atendimento',
  liquidacao: 'Pagamento',
  finalizado: 'Concluído',
};

@Component({
  selector: 'hp-atendimento-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
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
              <a
                [href]="'https://wa.me/' + onlyDigits(a.cliente.whatsapp)"
                target="_blank"
                rel="noopener"
              >{{ a.cliente.whatsapp }}</a>
            </p>
            @if (a.cliente.email) {
              <p><mat-icon>mail</mat-icon> {{ a.cliente.email }}</p>
            }
            @if (a.cliente.instagram) {
              <p><mat-icon>tag</mat-icon> &#64;{{ a.cliente.instagram }}</p>
            }
            <p class="meta">
              <mat-icon>schedule</mat-icon>
              Solicitado em {{ a.created_at | date:'short' }}
            </p>
          </mat-card-content>
        </mat-card>

        @if (a.descricao_solicitacao || a.servico) {
          <mat-card appearance="filled" class="info-card">
            <mat-card-header>
              <mat-card-title>Solicitação</mat-card-title>
            </mat-card-header>
            <mat-card-content class="solicitacao-content">
              @if (a.servico; as s) {
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
          <mat-card-header>
            <mat-card-title>Credenciais RustDesk</mat-card-title>
          </mat-card-header>
          <mat-card-content class="rustdesk-content">
            <div class="kv">
              <small>ID</small>
              <div class="copyable">
                <code>{{ a.rustdesk_id }}</code>
                <button
                  mat-icon-button
                  type="button"
                  (click)="copiar(a.rustdesk_id, 'ID copiado')"
                  aria-label="Copiar ID"
                >
                  <mat-icon>content_copy</mat-icon>
                </button>
              </div>
            </div>
            <div class="kv">
              <small>Senha temporária</small>
              <div class="copyable">
                <code>{{ a.rustdesk_password }}</code>
                <button
                  mat-icon-button
                  type="button"
                  (click)="copiar(a.rustdesk_password, 'Senha copiada')"
                  aria-label="Copiar senha"
                >
                  <mat-icon>content_copy</mat-icon>
                </button>
              </div>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="filled" class="info-card">
          <mat-card-content class="state-content">
            @switch (a.state) {
              @case ('conexao') {
                <p class="state-hint">
                  Cliente enviou as credenciais. Conecte no RustDesk e inicie
                  quando estiver dentro.
                </p>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="iniciar()"
                  [disabled]="updating()"
                >
                  <mat-icon>play_arrow</mat-icon>
                  <span>Iniciar atendimento</span>
                </button>
              }
              @case ('em_atendimento') {
                <p class="state-hint">
                  Suporte em andamento. Quando terminar, escolha um serviço (ou
                  digite um valor custom) e gere a cobrança PIX.
                </p>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Serviço pré-cadastrado</mat-label>
                  <mat-select (selectionChange)="aplicarServico($event.value)">
                    <mat-option [value]="null">— Personalizado —</mat-option>
                    @for (s of servicos(); track s.id) {
                      <mat-option [value]="s">
                        {{ s.nome }} — {{ s.valor_centavos / 100 | currency }}
                      </mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Valor</mat-label>
                  <span matTextPrefix>R$&nbsp;</span>
                  <input
                    matInput
                    type="number"
                    step="0.01"
                    min="0.01"
                    [formControl]="valorControl"
                    required
                  />
                  @if (
                    valorControl.hasError('required') ||
                    valorControl.hasError('min')
                  ) {
                    <mat-error>Informe um valor maior que zero</mat-error>
                  }
                </mat-form-field>

                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="gerarPix()"
                  [disabled]="valorControl.invalid || updating()"
                >
                  <mat-icon>qr_code_2</mat-icon>
                  <span>Gerar PIX e cobrar</span>
                </button>
              }
              @case ('liquidacao') {
                <p class="state-hint">
                  PIX gerado. O cliente está vendo o QR Code agora. Marque como
                  pago quando confirmar o recebimento.
                </p>
                @if (a.valor_centavos !== null) {
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
                  (click)="finalizar()"
                  [disabled]="updating()"
                >
                  <mat-icon>check_circle</mat-icon>
                  <span>Marcar como pago e finalizar</span>
                </button>
              }
              @case ('finalizado') {
                <p class="state-hint">Atendimento concluído.</p>
                @if (a.valor_centavos !== null) {
                  <p class="valor">{{ a.valor_centavos / 100 | currency }}</p>
                }
                <p class="meta">
                  Finalizado em {{ a.updated_at | date:'short' }}
                </p>
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
  private readonly servicosSvc = inject(ServicosService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly atendimento = signal<AtendimentoComRelacoes | null>(null);
  protected readonly servicos = signal<Servico[]>([]);
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valorControl = new FormControl<number>(0, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(0.01)],
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.carregar(id);
      void this.carregarServicos();
    }
  }

  voltar(): void {
    this.location.back();
  }

  stateLabel(state: AtendimentoState): string {
    return STATE_LABEL[state];
  }

  onlyDigits(s: string): string {
    return s.replace(/\D/g, '');
  }

  aplicarServico(servico: Servico | null): void {
    if (servico) {
      this.valorControl.setValue(servico.valor_centavos / 100);
    }
  }

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
      if (!a) {
        this.error.set('Atendimento não encontrado');
      }
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async carregarServicos(): Promise<void> {
    try {
      const list = await this.servicosSvc.list();
      this.servicos.set(list.filter((s) => s.ativo));
    } catch {
      // silencioso — admin pode usar valor personalizado
    }
  }

  async iniciar(): Promise<void> {
    const a = this.atendimento();
    if (!a) return;
    await this.transition(a.id, 'em_atendimento');
  }

  async gerarPix(): Promise<void> {
    const a = this.atendimento();
    if (!a || this.valorControl.invalid) return;
    const valor = this.valorControl.value;
    const cents = Math.round(valor * 100);
    if (cents <= 0) return;

    this.updating.set(true);
    try {
      await this.svc.generatePix(a.id, cents);
      this.snackBar.open(
        'PIX gerado. Cliente já vê o QR Code.',
        'OK',
        { duration: 3000 },
      );
      await this.carregar(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar PIX';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  async finalizar(): Promise<void> {
    const a = this.atendimento();
    if (!a) return;
    await this.transition(a.id, 'finalizado');
  }

  private async transition(
    id: string,
    state: AtendimentoState,
  ): Promise<void> {
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
