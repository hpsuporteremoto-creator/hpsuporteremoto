import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';
import { AtendimentosService } from '../atendimentos.service';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoComRelacoes,
  AtendimentoServicoInput,
  AtendimentoState,
} from '../atendimentos.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';

type CobrancaServicoBase = Pick<Servico, 'id' | 'nome' | 'valor_centavos' | 'categoria'>;

interface CobrancaServicoItem extends CobrancaServicoBase {
  quantidade: number;
  subtotal_centavos: number;
}

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
                    @if (s.quantidade > 1) {
                      <span class="servico-quantidade">{{ s.quantidade }}x</span>
                    }
                    <span class="servico-nome">{{ s.nome }}</span>
                    <span class="servico-valor">
                      {{ subtotalServico(s) / 100 | currency }}
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

                @if (servicosDisponiveis().length > 0) {
                  <section class="checkout" aria-label="Serviços para cobrança">
                    <div class="checkout-header">
                      <span>Serviços do atendimento</span>
                      <small>{{ quantidadeTotalParaCobranca() }} item(ns)</small>
                    </div>
                    <mat-form-field appearance="outline" class="full-width add-service-field">
                      <mat-label>Adicionar serviço</mat-label>
                      <mat-select
                        [value]="servicoParaAdicionarId()"
                        (selectionChange)="adicionarServico($event.value)"
                        (openedChange)="onPanelToggle($event)"
                        [disabled]="updating() || servicosParaAdicionar().length === 0"
                      >
                        <div class="servico-busca">
                          <mat-icon>search</mat-icon>
                          <input
                            type="text"
                            placeholder="Buscar serviço"
                            autocomplete="off"
                            aria-label="Buscar serviço"
                            [value]="servicoFiltro()"
                            (input)="onFiltroServicoChange($event)"
                            (keydown)="$event.stopPropagation()"
                            (click)="$event.stopPropagation()"
                          />
                          @if (servicoFiltro()) {
                            <button
                              type="button"
                              class="limpar-busca"
                              aria-label="Limpar busca"
                              (click)="limparFiltroServico($event)"
                              (keydown)="$event.stopPropagation()"
                            >
                              <mat-icon>close</mat-icon>
                            </button>
                          }
                        </div>

                        @for (servico of filteredServicosParaAdicionar(); track servico.id) {
                          <mat-option [value]="servico.id">
                            {{ servico.nome }}
                            @if (servico.categoria; as categoria) {
                              · {{ categoria.nome }}
                            }
                            — {{ servico.valor_centavos / 100 | currency }}
                          </mat-option>
                        }
                        @if (
                          servicosParaAdicionar().length > 0 &&
                          filteredServicosParaAdicionar().length === 0
                        ) {
                          <p class="servico-vazio">Nenhum serviço encontrado.</p>
                        } @else if (servicosParaAdicionar().length === 0) {
                          <p class="servico-vazio">Todos os serviços ativos já estão no pedido.</p>
                        }
                      </mat-select>
                    </mat-form-field>
                    @if (servicosParaCobranca().length === 0) {
                      <p class="empty-checkout">Selecione ao menos um item para cobrar.</p>
                    } @else {
                      <ul class="checkout-list">
                        @for (servico of servicosParaCobranca(); track servico.id) {
                          <li>
                            <span class="checkout-service">
                              <strong>{{ servico.nome }}</strong>
                              @if (servico.categoria; as categoria) {
                                <small>{{ categoria.nome }}</small>
                              }
                              <small>
                                {{ quantidadeServico(servico) }} x
                                {{ servico.valor_centavos / 100 | currency }}
                              </small>
                            </span>
                            <mat-form-field appearance="outline" class="quantity-field">
                              <mat-label>Qtd.</mat-label>
                              <input
                                matInput
                                type="number"
                                min="1"
                                max="99"
                                step="1"
                                inputmode="numeric"
                                [value]="quantidadeServico(servico)"
                                (input)="onQuantidadeChange(servico.id, $event)"
                                [disabled]="updating()"
                              />
                            </mat-form-field>
                            <strong>{{ subtotalServico(servico) / 100 | currency }}</strong>
                            <button
                              mat-icon-button
                              type="button"
                              (click)="removerServico(servico.id)"
                              [disabled]="updating()"
                              [attr.aria-label]="'Remover ' + servico.nome"
                            >
                              <mat-icon>close</mat-icon>
                            </button>
                          </li>
                        }
                      </ul>
                    }
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

                @if (servicosDisponiveis().length > 0) {
                  <section class="checkout" aria-label="Cobrança para pagamento">
                    <div class="checkout-header">
                      <span>Cobrança atual</span>
                      <small>{{ quantidadeTotalParaCobranca() }} item(ns)</small>
                    </div>
                    <mat-form-field appearance="outline" class="full-width add-service-field">
                      <mat-label>Adicionar serviço</mat-label>
                      <mat-select
                        [value]="servicoParaAdicionarId()"
                        (selectionChange)="adicionarServico($event.value)"
                        (openedChange)="onPanelToggle($event)"
                        [disabled]="updating() || servicosParaAdicionar().length === 0"
                      >
                        <div class="servico-busca">
                          <mat-icon>search</mat-icon>
                          <input
                            type="text"
                            placeholder="Buscar serviço"
                            autocomplete="off"
                            aria-label="Buscar serviço"
                            [value]="servicoFiltro()"
                            (input)="onFiltroServicoChange($event)"
                            (keydown)="$event.stopPropagation()"
                            (click)="$event.stopPropagation()"
                          />
                          @if (servicoFiltro()) {
                            <button
                              type="button"
                              class="limpar-busca"
                              aria-label="Limpar busca"
                              (click)="limparFiltroServico($event)"
                              (keydown)="$event.stopPropagation()"
                            >
                              <mat-icon>close</mat-icon>
                            </button>
                          }
                        </div>

                        @for (servico of filteredServicosParaAdicionar(); track servico.id) {
                          <mat-option [value]="servico.id">
                            {{ servico.nome }}
                            @if (servico.categoria; as categoria) {
                              · {{ categoria.nome }}
                            }
                            — {{ servico.valor_centavos / 100 | currency }}
                          </mat-option>
                        }
                        @if (
                          servicosParaAdicionar().length > 0 &&
                          filteredServicosParaAdicionar().length === 0
                        ) {
                          <p class="servico-vazio">Nenhum serviço encontrado.</p>
                        } @else if (servicosParaAdicionar().length === 0) {
                          <p class="servico-vazio">Todos os serviços ativos já estão no pedido.</p>
                        }
                      </mat-select>
                    </mat-form-field>
                    @if (servicosParaCobranca().length === 0) {
                      <p class="empty-checkout">Selecione ao menos um item para cobrar.</p>
                    } @else {
                      <ul class="checkout-list">
                        @for (servico of servicosParaCobranca(); track servico.id) {
                          <li>
                            <span class="checkout-service">
                              <strong>{{ servico.nome }}</strong>
                              @if (servico.categoria; as categoria) {
                                <small>{{ categoria.nome }}</small>
                              }
                              <small>
                                {{ quantidadeServico(servico) }} x
                                {{ servico.valor_centavos / 100 | currency }}
                              </small>
                            </span>
                            <mat-form-field appearance="outline" class="quantity-field">
                              <mat-label>Qtd.</mat-label>
                              <input
                                matInput
                                type="number"
                                min="1"
                                max="99"
                                step="1"
                                inputmode="numeric"
                                [value]="quantidadeServico(servico)"
                                (input)="onQuantidadeChange(servico.id, $event)"
                                [disabled]="updating()"
                              />
                            </mat-form-field>
                            <strong>{{ subtotalServico(servico) / 100 | currency }}</strong>
                            <button
                              mat-icon-button
                              type="button"
                              (click)="removerServico(servico.id)"
                              [disabled]="updating()"
                              [attr.aria-label]="'Remover ' + servico.nome"
                            >
                              <mat-icon>close</mat-icon>
                            </button>
                          </li>
                        }
                      </ul>
                    }
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
                  @if (cobrancaAlterada()) {
                    <p class="discount-warning" role="status">
                      Atualize o PIX para aplicar itens ou desconto antes de finalizar.
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
                  [disabled]="updating() || cobrancaAlterada() || descontoInvalido()"
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
  private readonly servicosSvc = inject(ServicosService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly atendimento = signal<AtendimentoComRelacoes | null>(null);
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly descontoCentavos = signal(0);
  protected readonly servicosDisponiveis = signal<CobrancaServicoBase[]>([]);
  protected readonly selectedServicoIds = signal<string[]>([]);
  protected readonly selectedServicoQuantidades = signal<Record<string, number>>({});
  protected readonly servicoFiltro = signal('');
  protected readonly servicoParaAdicionarId = signal<string | null>(null);

  protected readonly servicosParaCobranca = computed<CobrancaServicoItem[]>(() => {
    const atendimento = this.atendimento();
    const byId = new Map<string, CobrancaServicoBase>();
    for (const servico of this.servicosDisponiveis()) byId.set(servico.id, servico);
    if (atendimento) {
      for (const servico of atendimento.servicos_solicitados) {
        byId.set(servico.id, { ...servico, categoria: byId.get(servico.id)?.categoria ?? null });
      }
      if (atendimento.servico) {
        byId.set(atendimento.servico.id, {
          ...atendimento.servico,
          categoria: byId.get(atendimento.servico.id)?.categoria ?? null,
        });
      }
    }

    const quantidades = this.selectedServicoQuantidades();
    return this.selectedServicoIds().flatMap((id) => {
      const servico = byId.get(id);
      if (!servico) return [];
      const quantidade = Math.max(quantidades[id] ?? 1, 1);
      return [
        {
          ...servico,
          quantidade,
          subtotal_centavos: servico.valor_centavos * quantidade,
        },
      ];
    });
  });
  protected readonly servicosParaAdicionar = computed(() => {
    const selected = new Set(this.selectedServicoIds());
    return this.servicosDisponiveis().filter((servico) => !selected.has(servico.id));
  });
  protected readonly filteredServicosParaAdicionar = computed(() => {
    const termo = normalizeSearchKey(this.servicoFiltro());
    if (!termo) return this.servicosParaAdicionar();
    return this.servicosParaAdicionar().filter((servico) => {
      return (
        normalizeSearchKey(servico.nome).includes(termo) ||
        normalizeSearchKey(servico.categoria?.nome ?? '').includes(termo)
      );
    });
  });
  protected readonly quantidadeTotalParaCobranca = computed(() => {
    return this.servicosParaCobranca().reduce(
      (total, servico) => total + this.quantidadeServico(servico),
      0,
    );
  });
  protected readonly subtotalParaCobranca = computed(() => {
    return this.servicosParaCobranca().reduce(
      (total, servico) => total + this.subtotalServico(servico),
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
  protected readonly itensAlterados = computed(() => {
    const atendimento = this.atendimento();
    if (!atendimento) return false;
    const atuais = normalizeItensMap(getAtendimentoItens(atendimento));
    const selecionados = normalizeItensMap(
      this.servicosParaCobranca().map((servico) => ({
        servico_id: servico.id,
        quantidade: this.quantidadeServico(servico),
      })),
    );
    return !areItensEqual(atuais, selecionados);
  });
  protected readonly cobrancaAlterada = computed(
    () => this.descontoAlterado() || this.itensAlterados(),
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
      const [a, servicos] = await Promise.all([this.svc.get(id), this.servicosSvc.listAtivos()]);
      this.atendimento.set(a);
      this.descontoCentavos.set(Math.max(a?.desconto_centavos ?? 0, 0));
      if (!a) {
        this.error.set('Atendimento não encontrado');
        return;
      }
      this.servicosDisponiveis.set(mergeServicosDisponiveis(servicos, a));
      this.setSelectedItens(getAtendimentoItens(a));
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

  adicionarServico(value: unknown): void {
    if (typeof value !== 'string' || !value) return;
    this.selectedServicoIds.update((ids) => (ids.includes(value) ? ids : [...ids, value]));
    this.selectedServicoQuantidades.update((current) => {
      if (current[value]) return current;
      return { ...current, [value]: 1 };
    });
    this.servicoParaAdicionarId.set(null);
    this.servicoFiltro.set('');
  }

  onFiltroServicoChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.servicoFiltro.set(input?.value ?? '');
  }

  limparFiltroServico(event: Event): void {
    event.stopPropagation();
    this.servicoFiltro.set('');
  }

  removerServico(id: string): void {
    const ids = this.selectedServicoIds().filter((servicoId) => servicoId !== id);
    this.selectedServicoIds.set(ids);
    this.selectedServicoQuantidades.update((current) => {
      const { [id]: _removed, ...next } = current;
      return next;
    });
  }

  onQuantidadeChange(id: string, event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const quantidade = normalizeQuantidade(input?.value);
    this.selectedServicoQuantidades.update((current) => ({
      ...current,
      [id]: quantidade,
    }));
  }

  onPanelToggle(opened: boolean): void {
    if (!opened) this.servicoFiltro.set('');
  }

  async cobrarEFinalizar(): Promise<void> {
    await this.gerarPix('PIX gerado para cobrança.');
  }

  async atualizarPix(): Promise<void> {
    await this.gerarPix('PIX atualizado.');
  }

  private async gerarPix(successMessage: string): Promise<void> {
    const a = this.atendimento();
    const servicoItens = this.servicosParaCobranca().map((servico) => ({
      servico_id: servico.id,
      quantidade: this.quantidadeServico(servico),
    }));
    if (
      !a ||
      servicoItens.length === 0 ||
      this.descontoInvalido() ||
      this.totalParaCobranca() <= 0
    ) {
      return;
    }

    this.updating.set(true);
    try {
      await this.svc.cobrarEFinalizar(a.id, servicoItens, this.descontoParaCobranca());
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

  protected quantidadeServico(servico: { quantidade?: number }): number {
    return Math.max(servico.quantidade ?? 1, 1);
  }

  protected subtotalServico(
    servico: Pick<CobrancaServicoItem, 'valor_centavos' | 'quantidade' | 'subtotal_centavos'>,
  ): number {
    return servico.subtotal_centavos ?? servico.valor_centavos * this.quantidadeServico(servico);
  }

  private setSelectedItens(itens: readonly AtendimentoServicoInput[]): void {
    this.selectedServicoIds.set(itens.map((item) => item.servico_id));
    this.selectedServicoQuantidades.set(
      Object.fromEntries(
        itens.map((item) => [item.servico_id, normalizeQuantidade(item.quantidade)]),
      ),
    );
  }
}

function getAtendimentoItens(atendimento: AtendimentoComRelacoes): AtendimentoServicoInput[] {
  const servicos =
    atendimento.servicos_solicitados.length > 0
      ? atendimento.servicos_solicitados
      : atendimento.servico
        ? [atendimento.servico]
        : [];
  return servicos.map((servico) => ({
    servico_id: servico.id,
    quantidade: normalizeQuantidade(servico.quantidade),
  }));
}

function mergeServicosDisponiveis(
  ativos: readonly Servico[],
  atendimento: AtendimentoComRelacoes,
): CobrancaServicoBase[] {
  const byId = new Map<string, CobrancaServicoBase>();
  for (const servico of ativos) byId.set(servico.id, servico);
  for (const servico of atendimento.servicos_solicitados) {
    byId.set(servico.id, {
      id: servico.id,
      nome: servico.nome,
      valor_centavos: servico.valor_centavos,
      categoria: byId.get(servico.id)?.categoria ?? null,
    });
  }
  if (atendimento.servico) {
    byId.set(atendimento.servico.id, {
      id: atendimento.servico.id,
      nome: atendimento.servico.nome,
      valor_centavos: atendimento.servico.valor_centavos,
      categoria: byId.get(atendimento.servico.id)?.categoria ?? null,
    });
  }
  return [...byId.values()].sort((a, b) =>
    a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }),
  );
}

function normalizeItensMap(itens: readonly AtendimentoServicoInput[]): Map<string, number> {
  const byId = new Map<string, number>();
  for (const item of itens) {
    byId.set(
      item.servico_id,
      (byId.get(item.servico_id) ?? 0) + normalizeQuantidade(item.quantidade),
    );
  }
  return byId;
}

function areItensEqual(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, quantidade] of a) {
    if (b.get(id) !== quantidade) return false;
  }
  return true;
}

function normalizeQuantidade(value: unknown): number {
  const quantidade = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(quantidade) || quantidade < 1) return 1;
  return Math.min(quantidade, 99);
}

function normalizeSearchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
