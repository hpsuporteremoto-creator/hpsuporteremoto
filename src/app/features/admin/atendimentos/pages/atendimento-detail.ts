import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { isValidBrCode } from '@thiagoprazeres/pix-static-brcode';
import { parseE2EId } from '@thiagoprazeres/parse-e2eid';
import { toDataURL } from 'qrcode';
import { AuthService } from '../../../../core/auth/auth.service';
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';
import { AtendimentosService } from '../atendimentos.service';
import {
  ATENDIMENTO_STATE_LABEL,
  AtendimentoComRelacoes,
  AtendimentoServicoInput,
  AtendimentoState,
  PixRecebedorResumo,
} from '../atendimentos.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';
import {
  destacarBuscaServico,
  normalizarBuscaServico,
  servicoMatchesBusca,
  servicoSearchScore,
  type SearchHighlightSegment,
} from '../../../../shared/service-search.util';

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
        <button
          mat-stroked-button
          type="button"
          (click)="novoAtendimentoMesmoCliente(a)"
          [attr.aria-label]="'Novo pedido para ' + a.cliente.nome"
        >
          <mat-icon>add</mat-icon>
          <span>Novo pedido</span>
        </button>
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

        @if (a.criado_por || a.vendido_por || a.atendido_por) {
          <mat-card appearance="filled" class="info-card">
            <mat-card-header>
              <mat-card-title>Responsáveis</mat-card-title>
            </mat-card-header>
            <mat-card-content class="responsaveis-content">
              @if (a.criado_por) {
                <p>
                  <mat-icon>person_add</mat-icon>
                  <span>Pedido criado por</span>
                  <strong>{{ operadorLabel(a.criado_por) }}</strong>
                </p>
              }
              @if (a.vendido_por) {
                <p>
                  <mat-icon>point_of_sale</mat-icon>
                  <span>Venda/cobrança</span>
                  <strong>{{ operadorLabel(a.vendido_por) }}</strong>
                </p>
              }
              @if (a.atendido_por) {
                <p>
                  <mat-icon>engineering</mat-icon>
                  <span>Atendimento</span>
                  <strong>{{ operadorLabel(a.atendido_por) }}</strong>
                </p>
              }
            </mat-card-content>
          </mat-card>
        }

        @if (
          a.servicos_solicitados.length > 0 ||
          a.servico ||
          (a.descricao_solicitacao && a.state !== 'pagamento')
        ) {
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
              @if (a.descricao_solicitacao && a.state !== 'pagamento') {
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
                            @for (part of highlightServicoTexto(servico.nome); track $index) {
                              @if (part.highlighted) {
                                <mark class="search-highlight">{{ part.text }}</mark>
                              } @else {
                                {{ part.text }}
                              }
                            }
                            @if (servico.categoria; as categoria) {
                              ·
                              @for (part of highlightServicoTexto(categoria.nome); track $index) {
                                @if (part.highlighted) {
                                  <mark class="search-highlight">{{ part.text }}</mark>
                                } @else {
                                  {{ part.text }}
                                }
                              }
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
                    <mat-form-field appearance="outline" class="discount-field">
                      <mat-label>Acréscimo</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        step="0.01"
                        inputmode="decimal"
                        [value]="acrescimoParaCobranca() / 100"
                        (input)="onAcrescimoChange($event)"
                        [disabled]="updating()"
                      />
                      <span matTextPrefix>R$&nbsp;</span>
                    </mat-form-field>
                    <mat-form-field appearance="outline" class="description-field">
                      <mat-label>Descrição do pedido</mat-label>
                      <textarea
                        matInput
                        rows="4"
                        [value]="descricaoEdicao()"
                        (input)="onDescricaoChange($event)"
                        [disabled]="updating()"
                      ></textarea>
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
                      @if (acrescimoParaCobranca() > 0) {
                        <div class="surcharge-line">
                          <span>Acréscimo</span>
                          <strong>+{{ acrescimoParaCobranca() / 100 | currency }}</strong>
                        </div>
                      }
                    </div>
                    @if (ajusteInvalido()) {
                      <p class="discount-error" role="alert">
                        Os ajustes precisam deixar o total maior que zero.
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

                @if (pixRecebedores().length > 0) {
                  <mat-form-field appearance="outline" class="full-width pix-receiver-field">
                    <mat-label>Receber nesta chave PIX</mat-label>
                    <mat-select
                      [value]="pixRecebedorId()"
                      (selectionChange)="onPixRecebedorChange($event.value)"
                      [disabled]="updating()"
                    >
                      @for (recebedor of pixRecebedores(); track recebedor.id) {
                        <mat-option [value]="recebedor.id">
                          {{ recebedor.receiver_name }} · {{ recebedor.pix_key }}
                          @if (recebedor.padrao) { (padrão) }
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }

                <div class="action-row">
                  <button
                    mat-stroked-button
                    type="button"
                    (click)="salvarPedidoEmAndamento()"
                    [disabled]="
                      !pedidoAlterado() ||
                      servicosParaCobranca().length === 0 ||
                      ajusteInvalido() ||
                      totalParaCobranca() <= 0 ||
                      updating()
                    "
                  >
                    <mat-icon>save</mat-icon>
                    <span>Salvar alterações</span>
                  </button>
                  @if (auth.isAdmin()) {
                    <button
                      mat-stroked-button
                      type="button"
                      class="danger-action"
                      (click)="excluirPedidoEmAndamento()"
                      [disabled]="updating()"
                    >
                      <mat-icon>delete_outline</mat-icon>
                      <span>Excluir pedido</span>
                    </button>
                  }
                </div>

                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="cobrarEFinalizar()"
                  [disabled]="
                    servicosParaCobranca().length === 0 ||
                    ajusteInvalido() ||
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
                  PIX gerado. Se o valor for renegociado, ajuste desconto ou acréscimo e atualize o
                  PIX antes de marcar como pago.
                </p>
                <mat-form-field appearance="outline" class="payment-note-field">
                  <mat-label>Observação de cobrança</mat-label>
                  <textarea
                    matInput
                    rows="6"
                    [value]="descricaoEdicao()"
                    (input)="onDescricaoChange($event)"
                    [disabled]="updating()"
                  ></textarea>
                </mat-form-field>
                <button
                  mat-stroked-button
                  type="button"
                  class="payment-note-action"
                  (click)="salvarObservacaoPagamento()"
                  [disabled]="!descricaoAlterada() || updating()"
                >
                  <mat-icon>save</mat-icon>
                  <span>Salvar observação</span>
                </button>

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
                            @for (part of highlightServicoTexto(servico.nome); track $index) {
                              @if (part.highlighted) {
                                <mark class="search-highlight">{{ part.text }}</mark>
                              } @else {
                                {{ part.text }}
                              }
                            }
                            @if (servico.categoria; as categoria) {
                              ·
                              @for (part of highlightServicoTexto(categoria.nome); track $index) {
                                @if (part.highlighted) {
                                  <mark class="search-highlight">{{ part.text }}</mark>
                                } @else {
                                  {{ part.text }}
                                }
                              }
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
                    <mat-form-field appearance="outline" class="discount-field">
                      <mat-label>Acréscimo</mat-label>
                      <input
                        matInput
                        type="number"
                        min="0"
                        step="0.01"
                        inputmode="decimal"
                        [value]="acrescimoParaCobranca() / 100"
                        (input)="onAcrescimoChange($event)"
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
                      @if (acrescimoParaCobranca() > 0) {
                        <div class="surcharge-line">
                          <span>Acréscimo</span>
                          <strong>+{{ acrescimoParaCobranca() / 100 | currency }}</strong>
                        </div>
                      }
                    </div>
                    @if (ajusteInvalido()) {
                      <p class="discount-error" role="alert">
                        Os ajustes precisam deixar o total maior que zero.
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
                    [disabled]="ajusteInvalido() || totalParaCobranca() <= 0 || updating()"
                  >
                    <mat-icon>qr_code_2</mat-icon>
                    <span>Atualizar PIX {{ totalParaCobranca() / 100 | currency }}</span>
                  </button>
                  @if (cobrancaAlterada()) {
                    <p class="discount-warning" role="status">
                      Atualize o PIX para aplicar itens, desconto ou acréscimo antes de finalizar.
                    </p>
                  }
                } @else if (a.valor_centavos !== null) {
                  <p class="valor">{{ a.valor_centavos / 100 | currency }}</p>
                }
                @if (pixRecebedores().length > 0) {
                  <mat-form-field appearance="outline" class="full-width pix-receiver-field">
                    <mat-label>Chave PIX da cobrança</mat-label>
                    <mat-select
                      [value]="pixRecebedorId()"
                      (selectionChange)="onPixRecebedorChange($event.value)"
                      [disabled]="updating()"
                    >
                      @for (recebedor of pixRecebedores(); track recebedor.id) {
                        <mat-option [value]="recebedor.id">
                          {{ recebedor.receiver_name }} · {{ recebedor.pix_key }}
                          @if (recebedor.padrao) { (padrão) }
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
                @if (a.pix_brcode; as brcode) {
                  <div class="brcode-block">
                    @if (pixQrCode(); as qrCode) {
                      <figure class="pix-qrcode">
                        <img
                          [src]="qrCode"
                          width="256"
                          height="256"
                          alt="QR Code PIX para pagamento deste atendimento"
                        />
                      </figure>
                    }
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
                <section class="payment-proof" aria-label="Comprovação de pagamento">
                  <h3>Comprovação de pagamento</h3>
                  <p>Opcional: informe o EndToEndId do PIX ou anexe o comprovante.</p>
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>EndToEndId</mat-label>
                    <mat-icon matIconPrefix>receipt_long</mat-icon>
                    <input
                      matInput
                      maxlength="64"
                      autocomplete="off"
                      [value]="endToEndId()"
                      (input)="onEndToEndIdChange($event)"
                      [disabled]="updating()"
                    />
                    @if (endToEndIdInvalido()) {
                      <mat-error>EndToEndId inválido</mat-error>
                    }
                  </mat-form-field>
                  @if (endToEndPreview(); as payment) {
                    <p class="e2e-valid">
                      <mat-icon>verified</mat-icon>
                      EndToEndId válido · ISPB {{ payment.ispb }}
                    </p>
                  }
                  <label class="receipt-upload" [class.disabled]="updating()">
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png,image/webp"
                      (change)="onComprovanteChange($event)"
                      [disabled]="updating()"
                    />
                    <mat-icon>upload_file</mat-icon>
                    <span>Anexar comprovante</span>
                  </label>
                  @if (comprovanteSelecionado(); as comprovante) {
                    <p class="receipt-name"><mat-icon>attach_file</mat-icon>{{ comprovante.name }}</p>
                  }
                </section>
                <button
                  mat-flat-button
                  color="primary"
                  type="button"
                  (click)="marcarPago()"
                  [disabled]="updating() || cobrancaAlterada() || ajusteInvalido()"
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
                @if (a.pagamento_end_to_end_id || a.pagamento_comprovante_nome) {
                  <section class="payment-proof completed-proof" aria-label="Comprovação registrada">
                    <h3>Pagamento confirmado</h3>
                    @if (a.pagamento_end_to_end_id) {
                      <p><strong>EndToEndId:</strong> <code>{{ a.pagamento_end_to_end_id }}</code></p>
                      <p>
                        {{ a.pagamento_instituicao ?? 'Instituição não identificada no catálogo' }}
                        @if (a.pagamento_ispb) { · ISPB {{ a.pagamento_ispb }} }
                      </p>
                    }
                    @if (a.pagamento_comprovante_nome) {
                      <button mat-stroked-button type="button" (click)="abrirComprovante(a.id)">
                        <mat-icon>attach_file</mat-icon>
                        <span>Abrir comprovante</span>
                      </button>
                    }
                    @if (a.pagamento_confirmado_por; as operador) {
                      <p>Confirmado por {{ operadorLabel(operador) }}</p>
                    }
                  </section>
                }
                @if (!a.financeiro_contabilizado) {
                  <p class="accounting-disabled">
                    <mat-icon>money_off</mat-icon>
                    Não entra na contabilidade
                  </p>
                }
                <p class="meta">Finalizado em {{ a.updated_at | date: 'short' }}</p>
                @if (auth.isAdmin()) {
                  <button
                    mat-stroked-button
                    type="button"
                    class="accounting-action"
                    (click)="alterarContabilidade(!a.financeiro_contabilizado)"
                    [disabled]="updating()"
                  >
                    <mat-icon>
                      {{ a.financeiro_contabilizado ? 'money_off' : 'price_check' }}
                    </mat-icon>
                    <span>
                      {{
                        a.financeiro_contabilizado
                          ? 'Desabilitar da contabilidade'
                          : 'Reabilitar na contabilidade'
                      }}
                    </span>
                  </button>
                }
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
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly atendimento = signal<AtendimentoComRelacoes | null>(null);
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly descontoCentavos = signal(0);
  protected readonly acrescimoCentavos = signal(0);
  protected readonly descricaoEdicao = signal('');
  protected readonly servicosDisponiveis = signal<CobrancaServicoBase[]>([]);
  protected readonly selectedServicoIds = signal<string[]>([]);
  protected readonly selectedServicoQuantidades = signal<Record<string, number>>({});
  protected readonly servicoFiltro = signal('');
  protected readonly servicoParaAdicionarId = signal<string | null>(null);
  protected readonly pixQrCode = signal<string | null>(null);
  protected readonly pixRecebedores = signal<PixRecebedorResumo[]>([]);
  protected readonly pixRecebedorId = signal<string | null>(null);
  protected readonly endToEndId = signal('');
  protected readonly comprovanteSelecionado = signal<File | null>(null);
  protected readonly endToEndPreview = computed(() => {
    const value = this.endToEndId().trim();
    if (!value) return null;
    try {
      const parsed = parseE2EId(value);
      return {
        ispb: parsed.ispb,
      };
    } catch {
      return null;
    }
  });
  protected readonly endToEndIdInvalido = computed(
    () => this.endToEndId().trim().length > 0 && !this.endToEndPreview(),
  );

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
    const termo = normalizarBuscaServico(this.servicoFiltro());
    if (!termo) return this.servicosParaAdicionar();
    return this.servicosParaAdicionar()
      .filter((servico) => servicoMatchesBusca(servico, termo))
      .sort((a, b) => servicoSearchScore(b, termo) - servicoSearchScore(a, termo));
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
  protected readonly acrescimoParaCobranca = computed(() => Math.max(this.acrescimoCentavos(), 0));
  protected readonly totalParaCobranca = computed(() =>
    Math.max(
      this.subtotalParaCobranca() + this.acrescimoParaCobranca() - this.descontoParaCobranca(),
      0,
    ),
  );
  protected readonly ajusteInvalido = computed(
    () =>
      this.servicosParaCobranca().length > 0 &&
      this.subtotalParaCobranca() + this.acrescimoParaCobranca() - this.descontoParaCobranca() <= 0,
  );
  protected readonly descontoAlterado = computed(
    () => this.descontoParaCobranca() !== (this.atendimento()?.desconto_centavos ?? 0),
  );
  protected readonly acrescimoAlterado = computed(
    () => this.acrescimoParaCobranca() !== (this.atendimento()?.acrescimo_centavos ?? 0),
  );
  protected readonly descricaoAlterada = computed(() => {
    const atual = this.atendimento()?.descricao_solicitacao ?? '';
    return normalizeDescription(this.descricaoEdicao()) !== normalizeDescription(atual);
  });
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
  protected readonly pixRecebedorAlterado = computed(() => {
    const atendimento = this.atendimento();
    const selected = this.pixRecebedorId();
    return Boolean(atendimento?.state === 'pagamento' && selected && selected !== atendimento.pix_recebedor_id);
  });
  protected readonly cobrancaAlterada = computed(
    () =>
      this.descontoAlterado() ||
      this.acrescimoAlterado() ||
      this.itensAlterados() ||
      this.pixRecebedorAlterado(),
  );
  protected readonly pedidoAlterado = computed(
    () => this.cobrancaAlterada() || this.descricaoAlterada(),
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

  novoAtendimentoMesmoCliente(atendimento: AtendimentoComRelacoes): void {
    void this.router.navigate(['/admin/atendimentos/novo'], {
      queryParams: {
        clienteId: atendimento.cliente.id,
        clienteNome: atendimento.cliente.nome,
      },
    });
  }

  stateLabel(state: AtendimentoState): string {
    return ATENDIMENTO_STATE_LABEL[state];
  }

  protected readonly formatWhatsapp = formatWhatsappDisplay;

  protected operadorLabel(operador: AtendimentoComRelacoes['criado_por']): string {
    return operador?.full_name?.trim() || operador?.email || 'usuário';
  }

  protected highlightServicoTexto(value: string): readonly SearchHighlightSegment[] {
    return destacarBuscaServico(value, this.servicoFiltro());
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
      const [a, servicos, recebedores] = await Promise.all([
        this.svc.get(id),
        this.servicosSvc.listAtivos(),
        this.svc.listPixRecebedores(),
      ]);
      this.atendimento.set(a);
      this.pixRecebedores.set(recebedores);
      this.pixRecebedorId.set(
        a?.pix_recebedor_id ?? recebedores.find((recebedor) => recebedor.padrao)?.id ?? recebedores[0]?.id ?? null,
      );
      this.endToEndId.set('');
      this.comprovanteSelecionado.set(null);
      await this.atualizarQrCode(a?.pix_brcode ?? null);
      this.descontoCentavos.set(Math.max(a?.desconto_centavos ?? 0, 0));
      this.acrescimoCentavos.set(Math.max(a?.acrescimo_centavos ?? 0, 0));
      this.descricaoEdicao.set(a?.descricao_solicitacao ?? '');
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

  onAcrescimoChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const value = Number(input?.value ?? 0);
    const acrescimo = Number.isFinite(value) ? Math.max(0, value) : 0;
    this.acrescimoCentavos.set(Math.round(acrescimo * 100));
  }

  onDescricaoChange(event: Event): void {
    const input = event.target as HTMLTextAreaElement | null;
    this.descricaoEdicao.set(input?.value ?? '');
  }

  onPixRecebedorChange(value: unknown): void {
    this.pixRecebedorId.set(typeof value === 'string' && value ? value : null);
  }

  onEndToEndIdChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.endToEndId.set((input?.value ?? '').replace(/\s+/g, '').toUpperCase());
  }

  onComprovanteChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.comprovanteSelecionado.set(input?.files?.[0] ?? null);
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

  async salvarPedidoEmAndamento(): Promise<void> {
    const a = this.atendimento();
    if (
      !a ||
      !isEditableState(a.state) ||
      this.servicosParaCobranca().length === 0 ||
      this.ajusteInvalido() ||
      this.totalParaCobranca() <= 0
    ) {
      return;
    }

    this.updating.set(true);
    try {
      await this.svc.atualizarEmAndamento(a.id, {
        servico_itens: this.servicosParaCobranca().map((servico) => ({
          servico_id: servico.id,
          quantidade: this.quantidadeServico(servico),
        })),
        desconto_centavos: this.descontoParaCobranca(),
        acrescimo_centavos: this.acrescimoParaCobranca(),
        descricao_solicitacao: normalizeDescription(this.descricaoEdicao()),
      });
      this.snackBar.open('Pedido atualizado.', 'OK', { duration: 2500 });
      await this.carregar(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar pedido';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  async excluirPedidoEmAndamento(): Promise<void> {
    const a = this.atendimento();
    if (!a || !isEditableState(a.state) || !this.auth.isAdmin()) return;
    const ok = confirm(`Excluir o pedido de ${a.cliente.nome}? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    this.updating.set(true);
    try {
      await this.svc.excluir(a.id);
      this.snackBar.open('Pedido excluído.', 'OK', { duration: 2500 });
      await this.router.navigate(['/admin/atendimentos'], {
        queryParams: { filter: 'em_andamento' },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir pedido';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  async atualizarPix(): Promise<void> {
    await this.gerarPix('PIX atualizado.');
  }

  async salvarObservacaoPagamento(): Promise<void> {
    const a = this.atendimento();
    if (!a || a.state !== 'pagamento' || !this.descricaoAlterada()) return;

    this.updating.set(true);
    try {
      await this.svc.atualizarObservacaoPagamento(
        a.id,
        normalizeDescription(this.descricaoEdicao()),
      );
      this.snackBar.open('Observação salva.', 'OK', { duration: 2500 });
      await this.carregar(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar observação';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  private async gerarPix(successMessage: string): Promise<void> {
    const a = this.atendimento();
    const servicoItens = this.servicosParaCobranca().map((servico) => ({
      servico_id: servico.id,
      quantidade: this.quantidadeServico(servico),
    }));
    if (!a || servicoItens.length === 0 || this.ajusteInvalido() || this.totalParaCobranca() <= 0) {
      return;
    }

    this.updating.set(true);
    try {
      await this.svc.cobrarEFinalizar(
        a.id,
        servicoItens,
        this.descontoParaCobranca(),
        this.acrescimoParaCobranca(),
        normalizeDescription(this.descricaoEdicao()),
        this.pixRecebedorId(),
      );
      this.snackBar.open(successMessage, 'OK', { duration: 3000 });
      await this.carregar(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao gerar PIX';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  private async atualizarQrCode(brcode: string | null): Promise<void> {
    this.pixQrCode.set(null);
    if (!brcode || !isValidBrCode(brcode)) return;
    try {
      const qrCode = await toDataURL(brcode, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#ffffffff' },
      });
      if (this.atendimento()?.pix_brcode === brcode) this.pixQrCode.set(qrCode);
    } catch {
      this.pixQrCode.set(null);
    }
  }

  async alterarContabilidade(contabilizar: boolean): Promise<void> {
    const a = this.atendimento();
    if (!a || a.state !== 'concluido' || !this.auth.isAdmin()) return;

    const ok = confirm(
      contabilizar
        ? 'Reabilitar este atendimento na contabilidade?'
        : 'Desabilitar este atendimento da contabilidade? Ele continuará no histórico.',
    );
    if (!ok) return;

    this.updating.set(true);
    try {
      await this.svc.atualizarContabilidade(a.id, contabilizar);
      this.snackBar.open(
        contabilizar
          ? 'Atendimento reabilitado na contabilidade.'
          : 'Atendimento desabilitado da contabilidade.',
        'OK',
        { duration: 3000 },
      );
      await this.carregar(a.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar contabilidade';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }

  async marcarPago(): Promise<void> {
    const a = this.atendimento();
    if (!a) return;
    if (a.state === 'pagamento') {
      this.updating.set(true);
      try {
        if (this.descricaoAlterada()) {
          await this.svc.atualizarObservacaoPagamento(
            a.id,
            normalizeDescription(this.descricaoEdicao()),
          );
        }
        let comprovante: { path: string; nome: string; tipo: string } | null = null;
        if (this.comprovanteSelecionado()) {
          comprovante = await this.svc.enviarComprovante(a.id, this.comprovanteSelecionado()!);
        }
        await this.svc.confirmarPagamento({
          atendimento_id: a.id,
          end_to_end_id: this.endToEndId().trim() || null,
          comprovante_path: comprovante?.path ?? null,
          comprovante_nome: comprovante?.nome ?? null,
          comprovante_tipo: comprovante?.tipo ?? null,
        });
        this.snackBar.open('Pagamento confirmado.', 'OK', { duration: 2500 });
        await this.carregar(a.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao finalizar';
        this.snackBar.open(msg, 'OK', { duration: 4000 });
      } finally {
        this.updating.set(false);
      }
      return;
    }
    await this.transition(a.id, 'concluido');
  }

  async abrirComprovante(atendimentoId: string): Promise<void> {
    try {
      const url = await this.svc.abrirComprovante(atendimentoId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Não foi possível abrir o comprovante';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
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

function isEditableState(state: AtendimentoState): boolean {
  return state === 'em_andamento' || state === 'aguardando_confirmacao';
}

function normalizeDescription(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeQuantidade(value: unknown): number {
  const quantidade = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(quantidade) || quantidade < 1) return 1;
  return Math.min(quantidade, 99);
}
