import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FunilStepper } from '../../../../shared/funil-stepper';
import { AtendimentosService } from '../atendimentos.service';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoComRelacoes,
  AtendimentoState,
} from '../atendimentos.types';
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';

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
    MatSelectModule,
    MatToolbarModule,
    FunilStepper,
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
        <div class="stepper-wrap">
          <hp-funil-stepper [currentState]="a.state" />
        </div>

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
              @case ('aguardando_confirmacao') {
                <p class="state-hint">
                  Cliente enviou as credenciais. Confira o RustDesk e confirme
                  o atendimento quando estiver pronto pra começar.
                </p>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="confirmar()"
                  [disabled]="updating()"
                >
                  <mat-icon>check</mat-icon>
                  <span>Confirmar atendimento</span>
                </button>
              }
              @case ('em_andamento') {
                <p class="state-hint">
                  Suporte em andamento. Quando terminar, confirme o serviço e
                  cobre via PIX — o valor é puxado do cadastro do serviço.
                </p>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Serviço</mat-label>
                  <mat-select
                    [value]="selectedServicoId()"
                    (selectionChange)="onSelectServico($event.value)"
                  >
                    @for (s of servicos(); track s.id) {
                      <mat-option [value]="s.id">
                        {{ s.nome }} — {{ s.valor_centavos / 100 | currency }}
                      </mat-option>
                    }
                  </mat-select>
                  @if (servicos().length === 0) {
                    <mat-hint>
                      Nenhum serviço ativo. Cadastre em /admin/servicos.
                    </mat-hint>
                  }
                </mat-form-field>

                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="cobrarEFinalizar()"
                  [disabled]="!selectedServicoId() || updating()"
                >
                  <mat-icon>qr_code_2</mat-icon>
                  <span>
                    @if (selectedServicoValor(); as v) {
                      Cobrar {{ v / 100 | currency }} e finalizar
                    } @else {
                      Selecione um serviço
                    }
                  </span>
                </button>
              }
              @case ('pagamento') {
                <p class="state-hint">
                  PIX gerado. O cliente está vendo o QR Code. Marque como pago
                  quando confirmar o recebimento na conta.
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
                  (click)="marcarPago()"
                  [disabled]="updating()"
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

  protected readonly selectedServicoId = signal<string | null>(null);
  protected readonly selectedServicoValor = computed<number | null>(() => {
    const id = this.selectedServicoId();
    if (!id) return null;
    const s = this.servicos().find((x) => x.id === id);
    return s?.valor_centavos ?? null;
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
    return ATENDIMENTO_STATE_LABEL[state];
  }

  onlyDigits(s: string): string {
    return s.replace(/\D/g, '');
  }

  onSelectServico(id: string | null): void {
    this.selectedServicoId.set(id);
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
        return;
      }
      // Pré-seleciona o serviço do atendimento (escolhido pelo cliente),
      // se houver. Admin pode trocar pelo dropdown.
      if (a.servico_id) {
        this.selectedServicoId.set(a.servico_id);
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
      const list = await this.servicosSvc.listAtivos();
      this.servicos.set(list);
    } catch {
      // silencioso — o picker só fica vazio
    }
  }

  async confirmar(): Promise<void> {
    const a = this.atendimento();
    if (!a) return;
    await this.transition(a.id, 'em_andamento');
  }

  async cobrarEFinalizar(): Promise<void> {
    const a = this.atendimento();
    const servicoId = this.selectedServicoId();
    if (!a || !servicoId) return;

    this.updating.set(true);
    try {
      await this.svc.cobrarEFinalizar(a.id, servicoId);
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

  async marcarPago(): Promise<void> {
    const a = this.atendimento();
    if (!a) return;
    await this.transition(a.id, 'concluido');
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
