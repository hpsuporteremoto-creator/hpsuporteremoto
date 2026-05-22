import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { AtendimentosService } from '../atendimentos.service';
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';

export interface NovoAtendimentoDialogData {
  clienteId: string;
  clienteNome: string;
}

@Component({
  selector: 'hp-novo-atendimento-dialog',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Novo pedido</h2>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <mat-dialog-content>
      <p class="cliente">
        Cliente: <strong>{{ data.clienteNome }}</strong>
      </p>

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Serviços</mat-label>
          <mat-select
            formControlName="servico_ids"
            multiple
            required
            (selectionChange)="onServicosChange($event.value)"
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

        @if (selectedTotal(); as total) {
          <p class="total">
            Total selecionado <strong>{{ total / 100 | currency }}</strong>
          </p>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Descrição da solicitação</mat-label>
          <textarea
            matInput
            formControlName="descricao_solicitacao"
            rows="4"
            placeholder="Descreva o serviço combinado com o cliente"
          ></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="cancelar()">Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        type="button"
        (click)="onSubmit()"
        [disabled]="form.invalid || saving() || loading()"
      >
        <mat-icon>add_task</mat-icon>
        <span>Criar e iniciar</span>
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    :host
      display: block
    .cliente
      margin: 0 0 1rem
    .error
      color: var(--mat-sys-error)
    .full-width
      width: 100%
    .total
      margin: -0.5rem 0 0.75rem
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NovoAtendimentoDialog {
  private readonly atendimentos = inject(AtendimentosService);
  private readonly servicosSvc = inject(ServicosService);
  private readonly dialogRef =
    inject<MatDialogRef<NovoAtendimentoDialog, string>>(MatDialogRef);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly data = inject<NovoAtendimentoDialogData>(MAT_DIALOG_DATA);

  protected readonly servicos = signal<Servico[]>([]);
  protected readonly selectedServicoIds = signal<string[]>([]);
  protected readonly servicoFiltro = signal('');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedTotal = computed(() => {
    const ids = new Set(this.selectedServicoIds());
    return this.servicos()
      .filter((servico) => ids.has(servico.id))
      .reduce((total, servico) => total + servico.valor_centavos, 0);
  });

  // Serviços filtrados pela busca. Os já selecionados ficam sempre visíveis
  // para o resumo do mat-select continuar correto com o filtro ativo.
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
    void this.carregarServicos();
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

  onPanelToggle(opened: boolean): void {
    if (!opened) this.servicoFiltro.set('');
  }

  cancelar(): void {
    this.dialogRef.close();
  }

  async carregarServicos(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.servicos.set(await this.servicosSvc.listAtivos());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar serviços');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    try {
      const id = await this.atendimentos.criarParaCliente(this.data.clienteId, {
        servico_ids: value.servico_ids,
        descricao_solicitacao: value.descricao_solicitacao.trim() || null,
      });
      this.dialogRef.close(id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao criar atendimento');
    } finally {
      this.saving.set(false);
    }
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
