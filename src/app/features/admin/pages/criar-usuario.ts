import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../../core/auth/auth.service';
import { IonIcon } from '../../../shared/ion-icon';

@Component({
  selector: 'hp-criar-usuario',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatToolbarModule,
    IonIcon,
  ],
  template: `
    <mat-toolbar color="primary">
      <button
        mat-icon-button
        type="button"
        (click)="voltar()"
        aria-label="Voltar"
      >
        <ion-icon name="arrow-back-outline" />
      </button>
      <span>Criar novo usuário</span>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          <p class="hint">
            Adicione um email para conceder acesso. A pessoa entra no sistema
            usando a conta Google associada a esse email.
          </p>

          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Email</mat-label>
              <ion-icon matIconPrefix name="mail-outline" />
              <input
                matInput
                type="email"
                formControlName="email"
                autocomplete="off"
                required
              />
              @if (form.controls.email.hasError('required')) {
                <mat-error>Email é obrigatório</mat-error>
              } @else if (form.controls.email.hasError('email')) {
                <mat-error>Email inválido</mat-error>
              }
            </mat-form-field>

            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || loading()"
            >
              <ion-icon name="person-add-outline" />
              <span>Criar usuário</span>
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './criar-usuario.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CriarUsuarioPage {
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly loading = signal(false);

  voltar(): void {
    this.location.back();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    const email = this.form.getRawValue().email.trim();

    this.loading.set(true);

    const token = await this.auth.getAccessToken();
    if (!token) {
      this.snackBar.open('Sessão inválida. Faça login novamente.', 'OK', {
        duration: 4000,
      });
      this.loading.set(false);
      return;
    }

    try {
      const response = await fetch('/api/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        user?: { email: string };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Erro ${response.status}`);
      }

      this.snackBar.open(
        `Usuário ${payload.user?.email ?? email} criado`,
        'OK',
        { duration: 4000 },
      );
      this.form.reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      this.snackBar.open(message, 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }
}
