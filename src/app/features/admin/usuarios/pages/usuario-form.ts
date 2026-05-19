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
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { UsuariosService } from '../usuarios.service';

@Component({
  selector: 'hp-usuario-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>{{ isNew() ? 'Novo usuário' : 'Editar usuário' }}</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          @if (isNew()) {
            <p class="hint">
              Adicione um email para conceder acesso. A pessoa entra com Google
              usando essa conta — nome e foto são puxados automaticamente do
              perfil Google no primeiro login.
            </p>
            <form [formGroup]="newForm" (ngSubmit)="onCreate()">
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <mat-icon matIconPrefix>mail</mat-icon>
                <input
                  matInput
                  type="email"
                  formControlName="email"
                  autocomplete="off"
                  required
                />
                @if (newForm.controls.email.hasError('required')) {
                  <mat-error>Email é obrigatório</mat-error>
                } @else if (newForm.controls.email.hasError('email')) {
                  <mat-error>Email inválido</mat-error>
                }
              </mat-form-field>

              <div class="actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="newForm.invalid || saving()"
                >
                  <mat-icon>person_add</mat-icon>
                  <span>Criar usuário</span>
                </button>
              </div>
            </form>
          } @else {
            <form [formGroup]="editForm" (ngSubmit)="onUpdate()">
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <mat-icon matIconPrefix>mail</mat-icon>
                <input matInput formControlName="email" />
                <mat-hint>Email é gerenciado pelo Google e não pode ser alterado</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Nome completo</mat-label>
                <mat-icon matIconPrefix>badge</mat-icon>
                <input matInput formControlName="full_name" />
              </mat-form-field>

              <div class="actions">
                <button
                  mat-flat-button
                  color="primary"
                  type="submit"
                  [disabled]="editForm.invalid || saving() || loading()"
                >
                  <mat-icon>save</mat-icon>
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          }
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './usuario-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioFormPage {
  private readonly svc = inject(UsuariosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly id = signal<string | null>(null);
  protected readonly isNew = computed(() => this.id() === null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly newForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly editForm = this.fb.group({
    email: [{ value: '', disabled: true }],
    full_name: [''],
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
      const profile = await this.svc.get(id);
      if (!profile) {
        this.snackBar.open('Usuário não encontrado', 'OK', { duration: 4000 });
        this.router.navigate(['/admin/usuarios']);
        return;
      }
      this.editForm.controls.email.setValue(profile.email);
      this.editForm.controls.full_name.setValue(profile.full_name ?? '');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  async onCreate(): Promise<void> {
    if (this.newForm.invalid) return;
    this.saving.set(true);
    try {
      const result = await this.svc.create({
        email: this.newForm.getRawValue().email.trim(),
      });
      this.snackBar.open(`Usuário ${result.user.email} criado`, 'OK', {
        duration: 3000,
      });
      this.router.navigate(['/admin/usuarios']);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  async onUpdate(): Promise<void> {
    const id = this.id();
    if (!id || this.editForm.invalid) return;
    this.saving.set(true);
    try {
      const fullName = this.editForm.controls.full_name.value.trim();
      await this.svc.update(id, {
        full_name: fullName.length > 0 ? fullName : null,
      });
      this.snackBar.open('Usuário atualizado', 'OK', { duration: 3000 });
      this.router.navigate(['/admin/usuarios']);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
