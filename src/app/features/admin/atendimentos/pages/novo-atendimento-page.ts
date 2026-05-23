import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ClientesService } from '../../clientes/clientes.service';
import { Cliente } from '../../clientes/clientes.types';
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';
import { AtendimentosService } from '../atendimentos.service';

@Component({
  selector: 'hp-novo-atendimento-page',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
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
      <span>Novo pedido</span>
      <span class="spacer"></span>
      <a mat-stroked-button routerLink="/admin/clientes">
        <mat-icon>person_search</mat-icon>
        <span>Trocar cliente</span>
      </a>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      <section class="page-header">
        <div>
          <span class="eyebrow">Pedido administrativo</span>
          <h1>Criar atendimento</h1>
        </div>
        @if (cliente(); as c) {
          <mat-card appearance="filled" class="cliente-card">
            <mat-card-content>
              <mat-icon>account_circle</mat-icon>
              <div>
                <strong>{{ c.nome }}</strong>
                <small>{{ formatWhatsapp(c.whatsapp) }}</small>
              </div>
            </mat-card-content>
          </mat-card>
        }
      </section>

      <form class="layout" [formGroup]="form" (ngSubmit)="onSubmit()">
        <mat-card appearance="filled" class="form-card">
          <mat-card-header>
            <mat-card-title>Serviços e solicitação</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Serviços</mat-label>
              <mat-select
                formControlName="servico_ids"
                multiple
                required
                (selectionChange)="onServicosChange($event.value)"
                (openedChange)="onPanelToggle($event)"
              >
                <mat-select-trigger>
                  {{ selectedServicos().length }} serviço(s) ·
                  {{ selectedTotal() / 100 | currency }}
                </mat-select-trigger>

                <div class="servico-busca">
                  <mat-icon>search</mat-icon>
                  <input
                    type="text"
                    placeholder="Buscar serviço"
                    autocomplete="off"
                    aria-label="Buscar serviço"
                    [value]="servicoFiltro()"
                    (input)="onFiltroChange($event)"
                    (keydown)="$event.stopPropagation()"
                    (click)="$event.stopPropagation()"
                  />
                  @if (servicoFiltro()) {
                    <button
                      type="button"
                      class="limpar-busca"
                      aria-label="Limpar busca"
                      (click)="limparFiltro($event)"
                      (keydown)="$event.stopPropagation()"
                    >
                      <mat-icon>close</mat-icon>
                    </button>
                  }
                </div>

                @for (s of filteredServicos(); track s.id) {
                  <mat-option [value]="s.id">
                    {{ s.nome }} — {{ s.valor_centavos / 100 | currency }}
                  </mat-option>
                }
                @if (servicos().length > 0 && filteredServicos().length === 0) {
                  <p class="servico-vazio">Nenhum serviço encontrado.</p>
                }
              </mat-select>
              @if (form.controls.servico_ids.hasError('required')) {
                <mat-error>Escolha ao menos um serviço</mat-error>
              }
              @if (!loading() && servicos().length === 0) {
                <mat-hint>Cadastre ou ative serviços antes de abrir pedidos.</mat-hint>
              }
            </mat-form-field>

            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Descrição da solicitação</mat-label>
              <textarea
                matInput
                formControlName="descricao_solicitacao"
                rows="7"
                placeholder="Descreva o serviço combinado com o cliente"
              ></textarea>
            </mat-form-field>
          </mat-card-content>
        </mat-card>

        <aside class="checkout-column">
          <mat-card appearance="filled" class="checkout-card">
            <mat-card-header>
              <mat-card-title>Resumo do pedido</mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (selectedServicos().length === 0) {
                <p class="empty-checkout">Selecione um ou mais serviços.</p>
              } @else {
                <ul class="checkout-list">
                  @for (servico of selectedServicos(); track servico.id) {
                    <li>
                      <div class="checkout-info">
                        <strong>{{ servico.nome }}</strong>
                        @if (servico.categoria) {
                          <small>{{ servico.categoria }}</small>
                        }
                      </div>
                      <span class="checkout-price">
                        {{ servico.valor_centavos / 100 | currency }}
                      </span>
                      <button
                        mat-icon-button
                        type="button"
                        (click)="removerServico(servico.id)"
                        [attr.aria-label]="'Remover ' + servico.nome"
                      >
                        <mat-icon>close</mat-icon>
                      </button>
                    </li>
                  }
                </ul>

                <div class="checkout-total">
                  <span>Total</span>
                  <strong>{{ selectedTotal() / 100 | currency }}</strong>
                </div>
              }
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button type="button" (click)="cancelar()">Cancelar</button>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving() || loading() || !cliente()"
              >
                <mat-icon>add_task</mat-icon>
                <span>Criar e iniciar</span>
              </button>
            </mat-card-actions>
          </mat-card>
        </aside>
      </form>
    </main>
  `,
  styles: `
    :host
      display: block
    .spacer
      flex: 1
    .content
      width: min(72rem, calc(100% - 2rem))
      margin: 0 auto
      padding: 1.25rem 0 2rem
    .error
      margin: 0 0 1rem
      color: var(--mat-sys-error)
    .page-header
      display: grid
      grid-template-columns: minmax(0, 1fr) minmax(16rem, 24rem)
      gap: 1rem
      align-items: end
      margin-bottom: 1rem
    .eyebrow
      display: block
      color: var(--mat-sys-on-surface-variant)
      font-size: 0.8125rem
      font-weight: 700
      text-transform: uppercase
      letter-spacing: 0.04em
    h1
      margin: 0.125rem 0 0
      font-size: clamp(1.75rem, 3vw, 2.5rem)
      line-height: 1.1
    .cliente-card mat-card-content
      display: flex
      align-items: center
      gap: 0.75rem
      padding: 1rem !important
    .cliente-card mat-icon
      color: var(--mat-sys-primary)
    .cliente-card div
      min-width: 0
      display: flex
      flex-direction: column
      gap: 0.125rem
    .cliente-card strong,
    .cliente-card small
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
    .cliente-card small
      color: var(--mat-sys-on-surface-variant)
    .layout
      display: grid
      grid-template-columns: minmax(0, 1fr) minmax(18rem, 26rem)
      gap: 1rem
      align-items: start
    .form-card,
    .checkout-card,
    .cliente-card
      background: var(--mat-sys-surface-container)
    .form-card mat-card-content
      display: flex
      flex-direction: column
      gap: 1rem
      padding: 1rem !important
    .full-width
      width: 100%
    .checkout-column
      position: sticky
      top: 1rem
    .checkout-card mat-card-content
      padding: 0 1rem 1rem !important
    .empty-checkout
      margin: 0
      padding: 1rem
      border: 1px dashed var(--mat-sys-outline-variant)
      border-radius: 0.5rem
      color: var(--mat-sys-on-surface-variant)
      text-align: center
    .checkout-list
      list-style: none
      margin: 0
      padding: 0
      border: 1px solid var(--mat-sys-outline-variant)
      border-radius: 0.5rem
      overflow: hidden
    .checkout-list li
      display: grid
      grid-template-columns: minmax(0, 1fr) auto auto
      align-items: center
      gap: 0.75rem
      min-height: 3.75rem
      padding: 0.625rem 0.5rem 0.625rem 0.875rem
      border-bottom: 1px solid var(--mat-sys-outline-variant)
    .checkout-list li:last-child
      border-bottom: none
    .checkout-info
      min-width: 0
      display: flex
      flex-direction: column
      gap: 0.125rem
    .checkout-info strong
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
      font-size: 0.9375rem
    .checkout-info small
      color: var(--mat-sys-on-surface-variant)
    .checkout-price
      font-weight: 700
      white-space: nowrap
    .checkout-total
      display: flex
      align-items: center
      justify-content: space-between
      gap: 1rem
      margin-top: 1rem
      padding: 0.875rem 1rem
      border-radius: 0.5rem
      background: var(--mat-sys-surface-container-high)
    .checkout-total strong
      color: var(--mat-sys-tertiary)
      font-size: 1.25rem
    mat-card-actions
      padding: 0 1rem 1rem !important
      gap: 0.5rem
    .servico-busca
      position: sticky
      top: 0
      z-index: 1
      display: flex
      align-items: center
      gap: 0.5rem
      padding: 0.5rem 0.75rem
      background: var(--mat-sys-surface-container)
      border-bottom: 1px solid var(--mat-sys-outline-variant)
    .servico-busca mat-icon
      flex-shrink: 0
      color: var(--mat-sys-on-surface-variant)
    .servico-busca input
      flex: 1
      min-width: 0
      border: none
      background: transparent
      color: var(--mat-sys-on-surface)
      font: inherit
      outline: none
    .servico-busca input::placeholder
      color: var(--mat-sys-on-surface-variant)
    .limpar-busca
      display: inline-flex
      align-items: center
      justify-content: center
      padding: 0
      border: none
      background: transparent
      color: var(--mat-sys-on-surface-variant)
      cursor: pointer
    .servico-vazio
      margin: 0
      padding: 0.75rem
      text-align: center
      color: var(--mat-sys-on-surface-variant)
    @media (max-width: 780px)
      .content
        width: min(100% - 1rem, 72rem)
        padding-top: 0.75rem
      .page-header,
      .layout
        grid-template-columns: 1fr
      .checkout-column
        position: static
      mat-toolbar a span
        display: none
    @media (max-width: 520px)
      .checkout-list li
        grid-template-columns: minmax(0, 1fr) auto
      .checkout-list li button
        grid-column: 2
      .checkout-price
        grid-column: 1 / -1
      mat-card-actions
        display: grid
        grid-template-columns: 1fr
      mat-card-actions button
        width: 100%
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NovoAtendimentoPage {
  private readonly atendimentos = inject(AtendimentosService);
  private readonly clientesSvc = inject(ClientesService);
  private readonly servicosSvc = inject(ServicosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly cliente = signal<Cliente | null>(null);
  protected readonly clienteId = signal<string | null>(null);
  protected readonly clienteNomeFallback = signal('cliente selecionado');
  protected readonly servicos = signal<Servico[]>([]);
  protected readonly selectedServicoIds = signal<string[]>([]);
  protected readonly servicoFiltro = signal('');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formatWhatsapp = formatWhatsappDisplay;

  protected readonly selectedServicos = computed(() => {
    const byId = new Map(this.servicos().map((servico) => [servico.id, servico]));
    return this.selectedServicoIds().flatMap((id) => {
      const servico = byId.get(id);
      return servico ? [servico] : [];
    });
  });
  protected readonly selectedTotal = computed(() =>
    this.selectedServicos().reduce(
      (total, servico) => total + servico.valor_centavos,
      0,
    ),
  );
  protected readonly filteredServicos = computed(() => {
    const termo = normalizarBusca(this.servicoFiltro());
    const todos = this.servicos();
    if (!termo) return todos;
    const selecionados = new Set(this.selectedServicoIds());
    return todos.filter(
      (servico) =>
        selecionados.has(servico.id) ||
        normalizarBusca(servico.nome).includes(termo) ||
        normalizarBusca(servico.categoria ?? '').includes(termo),
    );
  });

  protected readonly form = this.fb.group({
    servico_ids: this.fb.control<string[]>([], [Validators.required]),
    descricao_solicitacao: [''],
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const clienteId = params.get('clienteId');
    this.clienteId.set(clienteId);
    this.clienteNomeFallback.set(params.get('clienteNome') ?? 'cliente selecionado');

    if (!clienteId) {
      void this.router.navigate(['/admin/clientes']);
      return;
    }

    void this.carregar(clienteId);
  }

  voltar(): void {
    this.location.back();
  }

  cancelar(): void {
    void this.router.navigate(['/admin/atendimentos'], {
      queryParams: this.atendimentosQueryParams(),
    });
  }

  onServicosChange(ids: string[]): void {
    this.selectedServicoIds.set(ids);
  }

  onFiltroChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.servicoFiltro.set(input?.value ?? '');
  }

  limparFiltro(event: Event): void {
    event.stopPropagation();
    this.servicoFiltro.set('');
  }

  removerServico(id: string): void {
    const ids = this.selectedServicoIds().filter((servicoId) => servicoId !== id);
    this.selectedServicoIds.set(ids);
    this.form.controls.servico_ids.setValue(ids);
    this.form.controls.servico_ids.markAsTouched();
  }

  onPanelToggle(opened: boolean): void {
    if (!opened) this.servicoFiltro.set('');
  }

  async onSubmit(): Promise<void> {
    const clienteId = this.clienteId();
    if (this.form.invalid || !clienteId || !this.cliente()) return;
    this.saving.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    try {
      const id = await this.atendimentos.criarParaCliente(clienteId, {
        servico_ids: value.servico_ids,
        descricao_solicitacao: value.descricao_solicitacao.trim() || null,
      });
      this.snackBar.open('Pedido criado e iniciado.', 'OK', { duration: 2500 });
      await this.router.navigate(['/admin/atendimentos', id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao criar atendimento');
    } finally {
      this.saving.set(false);
    }
  }

  private async carregar(clienteId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [cliente, servicos] = await Promise.all([
        this.clientesSvc.get(clienteId),
        this.servicosSvc.listAtivos(),
      ]);
      this.cliente.set(cliente);
      if (!cliente) {
        this.error.set('Cliente não encontrado.');
      }
      this.servicos.set(servicos);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      this.loading.set(false);
    }
  }

  private atendimentosQueryParams(): Record<string, string> {
    const cliente = this.cliente();
    const clienteId = this.clienteId();
    if (!clienteId) return {};
    return {
      clienteId,
      clienteNome: cliente?.nome ?? this.clienteNomeFallback(),
    };
  }
}

function normalizarBusca(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
