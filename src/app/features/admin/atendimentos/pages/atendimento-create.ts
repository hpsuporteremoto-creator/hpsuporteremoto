import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';
import { ClientesService } from '../../clientes/clientes.service';

@Component({
  selector: 'hp-atendimento-create',
  imports: [
    CurrencyPipe,
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
      <span>Novo atendimento</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      <mat-card appearance="filled" class="form-card">
        <mat-card-content class="card-content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <section class="section">
              <h2>Cliente</h2>
              <div class="field-grid">
                <mat-form-field appearance="outline">
                  <mat-label>Nome</mat-label>
                  <input matInput formControlName="nome" required />
                  @if (form.controls.nome.hasError('required')) {
                    <mat-error>Nome é obrigatório</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>WhatsApp</mat-label>
                  <mat-icon matIconPrefix>chat</mat-icon>
                  <input
                    matInput
                    type="tel"
                    formControlName="whatsapp"
                    placeholder="(11) 99999-9999"
                    required
                  />
                  @if (form.controls.whatsapp.hasError('required')) {
                    <mat-error>WhatsApp é obrigatório</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Email (opcional)</mat-label>
                  <mat-icon matIconPrefix>mail</mat-icon>
                  <input matInput type="email" formControlName="email" />
                  @if (form.controls.email.hasError('email')) {
                    <mat-error>Email inválido</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Instagram (opcional)</mat-label>
                  <span matTextPrefix>&#64;</span>
                  <input matInput formControlName="instagram" />
                </mat-form-field>
              </div>
            </section>

            <section class="section">
              <h2>Pedido</h2>
              <mat-form-field appearance="outline">
                <mat-label>Serviços</mat-label>
                <mat-select
                  formControlName="servico_ids"
                  multiple
                  required
                  (selectionChange)="onServicosChange($event.value)"
                >
                  @for (s of servicos(); track s.id) {
                    <mat-option [value]="s.id">
                      {{ s.nome }} — {{ s.valor_centavos / 100 | currency }}
                    </mat-option>
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
                  Total selecionado
                  <strong>{{ total / 100 | currency }}</strong>
                </p>
              }

              <mat-form-field appearance="outline">
                <mat-label>Descrição da solicitação</mat-label>
                <textarea
                  matInput
                  formControlName="descricao_solicitacao"
                  rows="4"
                  placeholder="Descreva o serviço combinado com o cliente"
                ></textarea>
              </mat-form-field>
            </section>

            <section class="section">
              <h2>RustDesk</h2>
              <div class="field-grid">
                <mat-form-field appearance="outline">
                  <mat-label>ID RustDesk (opcional)</mat-label>
                  <input matInput formControlName="rustdesk_id" />
                </mat-form-field>

                <mat-form-field appearance="outline">
                  <mat-label>Senha temporária (opcional)</mat-label>
                  <input matInput formControlName="rustdesk_password" />
                </mat-form-field>
              </div>
            </section>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving() || loading()"
              >
                <mat-icon>add_task</mat-icon>
                <span>Criar e iniciar atendimento</span>
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './atendimento-create.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtendimentoCreatePage {
  private readonly atendimentos = inject(AtendimentosService);
  private readonly servicosSvc = inject(ServicosService);
  private readonly clientesSvc = inject(ClientesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly servicos = signal<Servico[]>([]);
  protected readonly selectedServicoIds = signal<string[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedTotal = computed(() => {
    const ids = new Set(this.selectedServicoIds());
    return this.servicos()
      .filter((servico) => ids.has(servico.id))
      .reduce((total, servico) => total + servico.valor_centavos, 0);
  });

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    whatsapp: ['', [Validators.required, Validators.minLength(10)]],
    email: ['', [Validators.email]],
    instagram: [''],
    servico_ids: this.fb.control<string[]>([], [Validators.required]),
    descricao_solicitacao: [''],
    rustdesk_id: [''],
    rustdesk_password: [''],
  });

  constructor() {
    void this.carregarInicial();
  }

  voltar(): void {
    this.location.back();
  }

  onServicosChange(ids: string[]): void {
    this.selectedServicoIds.set(ids);
  }

  async carregarInicial(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([this.carregarServicos(), this.carregarClienteSelecionado()]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar atendimento');
    } finally {
      this.loading.set(false);
    }
  }

  async carregarServicos(): Promise<void> {
    this.servicos.set(await this.servicosSvc.listAtivos());
  }

  async carregarClienteSelecionado(): Promise<void> {
    const clienteId = this.route.snapshot.queryParamMap.get('clienteId');
    if (!clienteId) return;

    const cliente = await this.clientesSvc.get(clienteId);
    if (!cliente) {
      throw new Error('Cliente selecionado não encontrado');
    }

    this.form.patchValue({
      nome: cliente.nome,
      whatsapp: cliente.whatsapp,
      email: cliente.email ?? '',
      instagram: cliente.instagram ?? '',
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const value = this.form.getRawValue();
    const servicoIds = value.servico_ids;

    try {
      const id = await this.atendimentos.criarManual({
        nome: value.nome.trim(),
        whatsapp: value.whatsapp.trim(),
        email: value.email.trim() || null,
        instagram: value.instagram.trim() || null,
        servico_id: servicoIds[0] ?? null,
        servico_ids: servicoIds,
        descricao_solicitacao: value.descricao_solicitacao.trim() || null,
        rustdesk_id: value.rustdesk_id.trim() || null,
        rustdesk_password: value.rustdesk_password.trim() || null,
      });

      this.snackBar.open('Atendimento criado e iniciado', 'OK', { duration: 3000 });
      this.router.navigate(['../', id], { relativeTo: this.route });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao criar atendimento';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
