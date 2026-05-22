import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ClientesService } from '../clientes.service';
import { ClienteFormData } from '../clientes.types';

@Component({
  selector: 'hp-cliente-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>{{ isNew() ? 'Novo cliente' : 'Editar cliente' }}</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
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
              <mat-label>Instagram (opcional)</mat-label>
              <span matTextPrefix>&#64;</span>
              <input matInput formControlName="instagram" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Email (opcional)</mat-label>
              <mat-icon matIconPrefix>mail</mat-icon>
              <input matInput type="email" formControlName="email" />
              @if (form.controls.email.hasError('email')) {
                <mat-error>Email inválido</mat-error>
              }
            </mat-form-field>

            <mat-slide-toggle formControlName="ativo">Cliente ativo</mat-slide-toggle>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving() || loading()"
              >
                <mat-icon>save</mat-icon>
                <span>{{ isNew() ? 'Criar' : 'Salvar' }}</span>
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './cliente-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClienteFormPage {
  private readonly svc = inject(ClientesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly id = signal<string | null>(null);
  protected readonly isNew = computed(() => this.id() === null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    whatsapp: ['', [Validators.required, Validators.minLength(10)]],
    instagram: [''],
    email: ['', [Validators.email]],
    ativo: [true],
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.id.set(idParam);
      void this.carregar(idParam);
    }
  }

  voltar(): void {
    this.location.back();
  }

  async carregar(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const cliente = await this.svc.get(id);
      if (!cliente) {
        this.snackBar.open('Cliente não encontrado', 'OK', { duration: 4000 });
        this.router.navigate(['/admin/clientes']);
        return;
      }
      this.form.setValue({
        nome: cliente.nome,
        whatsapp: cliente.whatsapp,
        instagram: cliente.instagram ?? '',
        email: cliente.email ?? '',
        ativo: cliente.ativo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const value = this.form.getRawValue();
    const data: ClienteFormData = {
      nome: value.nome.trim(),
      whatsapp: value.whatsapp.trim(),
      instagram: value.instagram.trim() || null,
      email: value.email.trim() || null,
      ativo: value.ativo,
    };

    try {
      const id = this.id();
      if (id) {
        await this.svc.update(id, data);
        this.snackBar.open('Cliente atualizado', 'OK', { duration: 3000 });
        this.router.navigate(['/admin/clientes']);
      } else {
        const novo = await this.svc.create(data);
        this.snackBar.open('Cliente criado', 'OK', { duration: 3000 });
        this.router.navigate(['/admin/atendimentos'], {
          queryParams: { clienteId: novo.id, clienteNome: novo.nome },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
