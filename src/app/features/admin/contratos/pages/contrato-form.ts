import { DOCUMENT, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';
import { ContratosService } from '../contratos.service';
import { CONTRATO_STATUS_OPTIONS, ContratoStatus, toContratoStatusLabel } from '../contratos.types';

type ContratoCampo = 'objeto' | 'condicoes' | 'observacoes';

@Component({
  selector: 'hp-contrato-form',
  imports: [
    RouterLink,
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
      <span>{{ isEdit() ? 'Editar contrato' : 'Gerar contrato' }}</span>
      <span class="spacer"></span>
      <a mat-button [routerLink]="['/admin/clientes']">
        <mat-icon>groups</mat-icon>
        <span>Clientes</span>
      </a>
    </mat-toolbar>

    @if (loading() || loadingClientes()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      <section class="layout-grid">
        <mat-card appearance="filled" class="panel">
          <mat-card-header>
            <mat-card-title>Cliente</mat-card-title>
            <mat-card-subtitle>Busque por nome, email, WhatsApp ou observação</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <mat-form-field appearance="outline" class="search-field">
              <mat-label>Buscar cliente ativo</mat-label>
              <mat-icon matPrefix>search</mat-icon>
              <input
                matInput
                type="search"
                autocomplete="off"
                placeholder="Ex.: Arquitetura, AutoCAD, 819..."
                [value]="clienteBusca()"
                (input)="onSearch($event)"
              />
              @if (clienteBusca()) {
                <button
                  mat-icon-button
                  matSuffix
                  type="button"
                  (click)="limparBusca()"
                  aria-label="Limpar busca"
                >
                  <mat-icon>close</mat-icon>
                </button>
              }
            </mat-form-field>

            @if (clientes().length > 0) {
              <div class="client-results" aria-label="Clientes encontrados">
                @for (item of clientes(); track item.id) {
                  <button
                    mat-button
                    type="button"
                    class="client-option"
                    [class.is-selected]="clienteSelecionadoId() === item.id"
                    (click)="selecionarCliente(item)"
                    [attr.aria-pressed]="clienteSelecionadoId() === item.id"
                  >
                    <span>
                      <strong>{{ item.nome }}</strong>
                      <small>{{ formatWhatsapp(item.whatsapp) }}</small>
                    </span>
                    @if (clienteSelecionadoId() === item.id) {
                      <mat-icon>check_circle</mat-icon>
                    }
                  </button>
                }
              </div>
            } @else if (!loadingClientes()) {
              <p class="empty">Nenhum cliente ativo encontrado.</p>
            }
          </mat-card-content>
        </mat-card>

        <mat-card appearance="filled" class="panel selected-panel">
          <mat-card-header>
            <mat-card-title>Cliente selecionado</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            @if (cliente(); as selected) {
              <dl class="client-summary">
                <div>
                  <dt>Nome</dt>
                  <dd>{{ selected.nome }}</dd>
                </div>
                <div>
                  <dt>WhatsApp</dt>
                  <dd>{{ formatWhatsapp(selected.whatsapp) }}</dd>
                </div>
                @if (selected.email) {
                  <div>
                    <dt>Email</dt>
                    <dd>{{ selected.email }}</dd>
                  </div>
                }
                @if (selected.instagram) {
                  <div>
                    <dt>Instagram</dt>
                    <dd>{{ selected.instagram }}</dd>
                  </div>
                }
                @if (selected.observacao) {
                  <div>
                    <dt>Observação</dt>
                    <dd>{{ selected.observacao }}</dd>
                  </div>
                }
              </dl>
            } @else {
              <p class="empty">Selecione um cliente para montar o contrato.</p>
            }
          </mat-card-content>
        </mat-card>
      </section>

      <form [formGroup]="form" class="contract-form">
        <mat-card appearance="filled" class="panel">
          <mat-card-header>
            <mat-card-title>Dados do contrato</mat-card-title>
            <mat-card-subtitle>Ajuste o texto antes de imprimir ou salvar em PDF</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content class="fields">
            <mat-form-field appearance="outline">
              <mat-label>Status</mat-label>
              <mat-select formControlName="status">
                @for (status of statusOptions; track status.value) {
                  <mat-option [value]="status.value">{{ status.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Objeto do contrato</mat-label>
              <textarea matInput rows="5" formControlName="objeto"></textarea>
              @if (form.controls.objeto.invalid && form.controls.objeto.touched) {
                <mat-error>Informe o objeto do contrato.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Condições comerciais</mat-label>
              <textarea matInput rows="4" formControlName="condicoes"></textarea>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Observações</mat-label>
              <textarea matInput rows="4" formControlName="observacoes"></textarea>
            </mat-form-field>
          </mat-card-content>
        </mat-card>
      </form>

      <mat-card appearance="outlined" class="preview">
        <mat-card-header>
          <mat-card-title>Prévia</mat-card-title>
          <mat-card-subtitle>Contrato de Prestação de Serviços</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          @if (cliente(); as selected) {
            <article class="contract-preview">
              <h2>Contrato de Prestação de Serviços</h2>
              <p>
                Pelo presente instrumento, fica registrado o contrato entre
                <strong>HP Suporte Remoto</strong> e <strong>{{ selected.nome }}</strong
                >.
              </p>

              <dl>
                <div>
                  <dt>Cliente</dt>
                  <dd>{{ selected.nome }}</dd>
                </div>
                <div>
                  <dt>WhatsApp</dt>
                  <dd>{{ formatWhatsapp(selected.whatsapp) }}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{{ statusLabel() }}</dd>
                </div>
                @if (selected.email) {
                  <div>
                    <dt>Email</dt>
                    <dd>{{ selected.email }}</dd>
                  </div>
                }
              </dl>

              <h3>Objeto</h3>
              <p class="preserve-lines">{{ contratoTexto('objeto') }}</p>

              <h3>Condições comerciais</h3>
              <p class="preserve-lines">{{ contratoTexto('condicoes') }}</p>

              @if (temObservacoes()) {
                <h3>Observações</h3>
                <p class="preserve-lines">{{ contratoTexto('observacoes') }}</p>
              }

              <p class="date-line">Emitido em {{ hojeLabel }}.</p>
            </article>
          } @else {
            <p class="empty">A prévia aparece depois da seleção do cliente.</p>
          }
        </mat-card-content>
        <mat-card-actions align="end">
          <button
            mat-stroked-button
            type="button"
            [disabled]="!cliente() || form.invalid || saving()"
            (click)="salvarContrato()"
          >
            <mat-icon>save</mat-icon>
            <span>Salvar contrato</span>
          </button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!cliente() || form.invalid || saving()"
            (click)="imprimirContrato()"
          >
            <mat-icon>print</mat-icon>
            <span>Imprimir ou salvar PDF</span>
          </button>
        </mat-card-actions>
      </mat-card>
    </main>
  `,
  styleUrl: './contrato-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContratoFormPage {
  private readonly clientesService = inject(ClientesService);
  private readonly contratosService = inject(ContratosService);
  private readonly document = inject(DOCUMENT);
  private readonly fb = inject(FormBuilder);
  private readonly location = inject(Location);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly formatWhatsapp = formatWhatsappDisplay;
  protected readonly statusOptions = CONTRATO_STATUS_OPTIONS;
  protected readonly cliente = signal<Cliente | null>(null);
  protected readonly clientes = signal<Cliente[]>([]);
  protected readonly clienteBusca = signal('');
  protected readonly loading = signal(false);
  protected readonly loadingClientes = signal(false);
  protected readonly saving = signal(false);
  protected readonly contratoId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.contratoId() !== null);
  protected readonly error = signal<string | null>(null);
  protected readonly hojeLabel = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'long',
  }).format(new Date());
  protected readonly clienteSelecionadoId = computed(() => this.cliente()?.id ?? null);
  protected readonly form = this.fb.nonNullable.group({
    status: ['a_iniciar' as ContratoStatus, [Validators.required]],
    objeto: [
      'Prestação de serviços técnicos de software, suporte remoto, instalação, configuração, manutenção e/ou treinamento conforme demanda aprovada entre as partes.',
      [Validators.required],
    ],
    condicoes: [
      'Valores, prazos e escopo serão definidos em proposta, pedido ou mensagem comercial aprovada pelo cliente.',
    ],
    observacoes: [''],
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRun = 0;

  constructor() {
    const contratoId = this.route.snapshot.paramMap.get('id');
    if (contratoId) {
      this.contratoId.set(contratoId);
      void this.carregarContrato(contratoId);
      return;
    }

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const clienteId = params.get('clienteId');
      if (clienteId) {
        void this.carregarCliente(clienteId);
      }
    });
    void this.buscarClientes();
  }

  voltar(): void {
    this.location.back();
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.clienteBusca.set(input?.value ?? '');
    this.agendarBusca();
  }

  limparBusca(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.clienteBusca.set('');
    void this.buscarClientes();
  }

  selecionarCliente(cliente: Cliente): void {
    this.cliente.set(cliente);
  }

  contratoTexto(campo: ContratoCampo): string {
    return this.form.controls[campo].value.trim() || 'Não informado.';
  }

  temObservacoes(): boolean {
    return this.form.controls.observacoes.value.trim().length > 0;
  }

  statusLabel(): string {
    return toContratoStatusLabel(this.form.controls.status.value);
  }

  async carregarCliente(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const cliente = await this.clientesService.get(id);
      if (!cliente) {
        this.error.set('Cliente não encontrado.');
        return;
      }
      this.cliente.set(cliente);
      this.clienteBusca.set(cliente.nome);
      await this.buscarClientes();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar cliente.');
    } finally {
      this.loading.set(false);
    }
  }

  async carregarContrato(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const contrato = await this.contratosService.get(id);
      if (!contrato) {
        this.error.set('Contrato não encontrado.');
        return;
      }
      this.form.setValue({
        status: contrato.status,
        objeto: contrato.objeto,
        condicoes: contrato.condicoes ?? '',
        observacoes: contrato.observacoes ?? '',
      });
      await this.carregarCliente(contrato.cliente_id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar contrato.');
    } finally {
      this.loading.set(false);
    }
  }

  async buscarClientes(): Promise<void> {
    const run = ++this.searchRun;
    this.searchTimer = null;
    this.loadingClientes.set(true);
    this.error.set(null);
    try {
      const result = await this.clientesService.list({
        ativo: true,
        termo: this.clienteBusca(),
        pageIndex: 0,
        pageSize: 12,
      });
      if (run === this.searchRun) {
        this.clientes.set(result.clientes);
      }
    } catch (err) {
      if (run === this.searchRun) {
        this.error.set(err instanceof Error ? err.message : 'Erro ao buscar clientes.');
      }
    } finally {
      if (run === this.searchRun) {
        this.loadingClientes.set(false);
      }
    }
  }

  imprimirContrato(): void {
    const cliente = this.cliente();
    if (!cliente || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const windowRef = this.document.defaultView;
    const printWindow = windowRef?.open('', '_blank', 'width=900,height=720');
    if (!printWindow) {
      this.error.set('O navegador bloqueou a janela de impressão.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(this.contratoHtml(cliente));
    printWindow.document.close();
    printWindow.focus();
    windowRef?.setTimeout(() => printWindow.print(), 200);
  }

  async salvarContrato(): Promise<void> {
    const cliente = this.cliente();
    if (!cliente || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const value = this.form.getRawValue();
      const input = {
        cliente_id: cliente.id,
        status: value.status,
        objeto: value.objeto.trim(),
        condicoes: value.condicoes.trim() || null,
        observacoes: value.observacoes.trim() || null,
      };
      const id = this.contratoId();
      if (id) {
        await this.contratosService.update(id, input);
      } else {
        await this.contratosService.create(input);
      }
      this.snackBar.open(id ? 'Contrato atualizado' : 'Contrato salvo', 'OK', {
        duration: 2500,
      });
      await this.router.navigate(['/admin/contratos'], {
        queryParams: { status: value.status },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar contrato';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  private agendarBusca(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.buscarClientes(), 250);
  }

  private contratoHtml(cliente: Cliente): string {
    const dados = this.form.getRawValue();
    const observacoes = dados.observacoes.trim()
      ? this.secaoHtml('Observações', dados.observacoes)
      : '';

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <title>Contrato - ${this.escapeHtml(cliente.nome)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 48px;
        color: #171717;
        font-family: Arial, Helvetica, sans-serif;
        line-height: 1.5;
      }
      main { max-width: 760px; margin: 0 auto; }
      h1 { margin: 0 0 24px; font-size: 28px; }
      h2 { margin: 28px 0 8px; font-size: 18px; }
      p { margin: 0 0 12px; }
      dl { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; margin: 24px 0; }
      dt { font-weight: 700; }
      dd { margin: 0; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 72px; }
      .signature { border-top: 1px solid #171717; padding-top: 10px; text-align: center; }
      @media print {
        body { padding: 32px; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Contrato de Prestação de Serviços</h1>
      <p>
        Pelo presente instrumento, fica registrado o contrato entre
        <strong>HP Suporte Remoto</strong> e <strong>${this.escapeHtml(cliente.nome)}</strong>.
      </p>
      <dl>
        <dt>Cliente</dt>
        <dd>${this.escapeHtml(cliente.nome)}</dd>
        <dt>WhatsApp</dt>
        <dd>${this.escapeHtml(this.formatWhatsapp(cliente.whatsapp))}</dd>
        <dt>Status</dt>
        <dd>${this.escapeHtml(toContratoStatusLabel(dados.status))}</dd>
        <dt>Email</dt>
        <dd>${this.escapeHtml(cliente.email?.trim() || 'Não informado')}</dd>
        <dt>Instagram</dt>
        <dd>${this.escapeHtml(cliente.instagram?.trim() || 'Não informado')}</dd>
      </dl>
      ${this.secaoHtml('Objeto', dados.objeto)}
      ${this.secaoHtml('Condições comerciais', dados.condicoes)}
      ${observacoes}
      <p>Emitido em ${this.escapeHtml(this.hojeLabel)}.</p>
      <section class="signature-grid">
        <div class="signature">HP Suporte Remoto</div>
        <div class="signature">${this.escapeHtml(cliente.nome)}</div>
      </section>
    </main>
  </body>
</html>`;
  }

  private secaoHtml(titulo: string, texto: string): string {
    return `<h2>${this.escapeHtml(titulo)}</h2><p>${this.escapeHtml(
      texto.trim() || 'Não informado.',
    ).replace(/\r?\n/g, '<br>')}</p>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
