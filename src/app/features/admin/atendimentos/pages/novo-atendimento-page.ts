import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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

const SEM_CATEGORIA_ID = '__sem_categoria__';

interface SelectedServicoItem extends Servico {
  quantidade: number;
  subtotal_centavos: number;
}

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
              <mat-label>Adicionar serviço</mat-label>
              <mat-select
                formControlName="servico_id"
                (selectionChange)="adicionarServico($event.value)"
                (openedChange)="onPanelToggle($event)"
              >
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

                @if (categoriasServico().length > 0 || hasServicosSemCategoria()) {
                  <div
                    class="servico-categorias"
                    role="group"
                    aria-label="Filtrar serviços por categoria"
                  >
                    <button
                      type="button"
                      [class.active]="servicoCategoriaFiltro() === null"
                      [attr.aria-pressed]="servicoCategoriaFiltro() === null"
                      (click)="selecionarCategoriaServico(null, $event)"
                      (keydown)="$event.stopPropagation()"
                    >
                      Todos
                    </button>
                    @for (categoria of categoriasServico(); track categoria.id) {
                      <button
                        type="button"
                        [class.active]="servicoCategoriaFiltro() === categoria.id"
                        [attr.aria-pressed]="servicoCategoriaFiltro() === categoria.id"
                        (click)="selecionarCategoriaServico(categoria.id, $event)"
                        (keydown)="$event.stopPropagation()"
                      >
                        {{ categoria.nome }}
                      </button>
                    }
                    @if (hasServicosSemCategoria()) {
                      <button
                        type="button"
                        [class.active]="servicoCategoriaFiltro() === semCategoriaId"
                        [attr.aria-pressed]="servicoCategoriaFiltro() === semCategoriaId"
                        (click)="selecionarCategoriaServico(semCategoriaId, $event)"
                        (keydown)="$event.stopPropagation()"
                      >
                        Sem categoria
                      </button>
                    }
                  </div>
                }

                @for (s of filteredServicos(); track s.id) {
                  <mat-option [value]="s.id">
                    {{ s.nome }}
                    @if (s.categoria; as categoria) {
                      · {{ categoria.nome }}
                    }
                    — {{ s.valor_centavos / 100 | currency }}
                  </mat-option>
                }
                @if (servicos().length > 0 && filteredServicos().length === 0) {
                  <p class="servico-vazio">Nenhum serviço encontrado.</p>
                }
              </mat-select>
              @if (!loading() && servicos().length === 0) {
                <mat-hint>Cadastre ou ative serviços antes de abrir pedidos.</mat-hint>
              } @else {
                <mat-hint>Escolha um serviço por vez. Ajuste a quantidade no resumo.</mat-hint>
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
                <p class="empty-checkout">Adicione os serviços do pedido.</p>
              } @else {
                <ul class="checkout-list">
                  @for (servico of selectedServicos(); track servico.id) {
                    <li>
                      <div class="checkout-info">
                        <strong>{{ servico.nome }}</strong>
                        @if (servico.categoria; as categoria) {
                          <small>{{ categoria.nome }}</small>
                        }
                        <small> {{ servico.valor_centavos / 100 | currency }} cada </small>
                      </div>
                      <mat-form-field appearance="outline" class="quantity-field">
                        <mat-label>Qtd.</mat-label>
                        <input
                          matInput
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          inputmode="numeric"
                          [value]="servico.quantidade"
                          (input)="onQuantidadeChange(servico.id, $event)"
                        />
                      </mat-form-field>
                      <span class="checkout-price">
                        {{ servico.subtotal_centavos / 100 | currency }}
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
                  <span>{{ selectedQuantidadeTotal() }} item(ns)</span>
                  <strong>{{ totalComAjustes() / 100 | currency }}</strong>
                </div>
              }
            </mat-card-content>
            <mat-card-actions align="end">
              <button mat-button type="button" (click)="cancelar()">Cancelar</button>
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="selectedServicos().length === 0 || saving() || loading() || !cliente()"
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
      grid-template-columns: minmax(0, 1fr) 5.5rem auto auto
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
    .quantity-field
      width: 5.5rem
    .quantity-field ::ng-deep .mat-mdc-form-field-subscript-wrapper
      display: none
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
    .servico-categorias
      display: flex
      gap: 0.5rem
      padding: 0.5rem 0.75rem
      overflow-x: auto
      background: var(--mat-sys-surface-container)
      border-bottom: 1px solid var(--mat-sys-outline-variant)
    .servico-categorias button
      min-height: 2rem
      padding: 0 0.75rem
      border: 1px solid var(--mat-sys-outline-variant)
      border-radius: 999px
      background: var(--mat-sys-surface-container-high)
      color: var(--mat-sys-on-surface)
      font: inherit
      font-size: 0.875rem
      font-weight: 700
      white-space: nowrap
      cursor: pointer
    .servico-categorias button:focus-visible
      outline: 3px solid var(--mat-sys-primary)
      outline-offset: 2px
    .servico-categorias button.active
      border-color: var(--mat-sys-primary)
      background: var(--mat-sys-primary)
      color: var(--mat-sys-on-primary)
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
      .quantity-field
        grid-column: 1
        width: 6rem
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

  protected readonly semCategoriaId = SEM_CATEGORIA_ID;
  protected readonly cliente = signal<Cliente | null>(null);
  protected readonly clienteId = signal<string | null>(null);
  protected readonly clienteNomeFallback = signal('cliente selecionado');
  protected readonly servicos = signal<Servico[]>([]);
  protected readonly selectedServicoIds = signal<string[]>([]);
  protected readonly selectedServicoQuantidades = signal<Record<string, number>>({});
  protected readonly servicoFiltro = signal('');
  protected readonly servicoCategoriaFiltro = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly formatWhatsapp = formatWhatsappDisplay;

  protected readonly selectedServicos = computed<SelectedServicoItem[]>(() => {
    const byId = new Map(this.servicos().map((servico) => [servico.id, servico]));
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
  protected readonly selectedQuantidadeTotal = computed(() =>
    this.selectedServicos().reduce((total, servico) => total + servico.quantidade, 0),
  );
  protected readonly selectedTotal = computed(() =>
    this.selectedServicos().reduce((total, servico) => total + servico.subtotal_centavos, 0),
  );
  protected readonly totalComAjustes = computed(() => this.selectedTotal());
  protected readonly categoriasServico = computed(() => {
    const byId = new Map<string, { id: string; nome: string }>();
    for (const servico of this.servicos()) {
      if (!servico.categoria) continue;
      byId.set(servico.categoria.id, {
        id: servico.categoria.id,
        nome: servico.categoria.nome,
      });
    }
    return [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });
  protected readonly hasServicosSemCategoria = computed(() =>
    this.servicos().some((servico) => !servico.categoria),
  );
  protected readonly filteredServicos = computed(() => {
    const termo = normalizarBusca(this.servicoFiltro());
    const categoriaId = this.servicoCategoriaFiltro();
    const todos = this.servicos();
    if (!termo && !categoriaId) return todos;
    return todos.filter((servico) => {
      const matchesCategoria =
        !categoriaId ||
        (categoriaId === SEM_CATEGORIA_ID
          ? !servico.categoria
          : servico.categoria?.id === categoriaId);
      if (!matchesCategoria) return false;
      return (
        !termo ||
        normalizarBusca(servico.nome).includes(termo) ||
        normalizarBusca(servico.categoria?.nome ?? '').includes(termo)
      );
    });
  });

  protected readonly form = this.fb.group({
    servico_id: [''],
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

  adicionarServico(id: string | null): void {
    if (!id) return;
    this.selectedServicoIds.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
    this.selectedServicoQuantidades.update((current) => {
      if (current[id]) {
        return {
          ...current,
          [id]: normalizeQuantidade(current[id] + 1),
        };
      }
      return {
        ...current,
        [id]: 1,
      };
    });
    this.form.controls.servico_id.setValue('');
    this.servicoFiltro.set('');
  }

  onFiltroChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.servicoFiltro.set(input?.value ?? '');
  }

  limparFiltro(event: Event): void {
    event.stopPropagation();
    this.servicoFiltro.set('');
  }

  selecionarCategoriaServico(categoriaId: string | null, event: Event): void {
    event.stopPropagation();
    this.servicoCategoriaFiltro.set(categoriaId);
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

  async onSubmit(): Promise<void> {
    const clienteId = this.clienteId();
    if (this.selectedServicos().length === 0 || !clienteId || !this.cliente()) return;
    this.saving.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    try {
      const id = await this.atendimentos.criarParaCliente(clienteId, {
        servico_itens: this.selectedServicos().map((servico) => ({
          servico_id: servico.id,
          quantidade: servico.quantidade,
        })),
        desconto_centavos: 0,
        acrescimo_centavos: 0,
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
      this.ensureServicoCategoriaValida(servicos);
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

  private ensureServicoCategoriaValida(servicos: readonly Servico[]): void {
    const categoriaId = this.servicoCategoriaFiltro();
    if (!categoriaId) return;
    const hasCategoria =
      categoriaId === SEM_CATEGORIA_ID
        ? servicos.some((servico) => !servico.categoria)
        : servicos.some((servico) => servico.categoria?.id === categoriaId);
    if (!hasCategoria) this.servicoCategoriaFiltro.set(null);
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

function normalizeQuantidade(value: unknown): number {
  const quantidade = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(quantidade) || quantidade < 1) return 1;
  return Math.min(quantidade, 99);
}
