import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';
import { IonIcon } from '../../../shared/ion-icon';

@Component({
  selector: 'hp-login',
  imports: [MatButtonModule, MatCardModule, MatProgressSpinnerModule, IonIcon],
  template: `
    <main class="login-wrap">
      <mat-card class="login-card" appearance="filled">
        <mat-card-content class="login-content">
          <h1>HP suporte remoto</h1>
          <p class="hint">
            Faça login com sua conta Google autorizada para acessar o sistema.
          </p>
          <button
            mat-flat-button
            color="primary"
            class="signin"
            type="button"
            (click)="signIn()"
            [disabled]="loading()"
          >
            @if (loading()) {
              <mat-progress-spinner mode="indeterminate" diameter="20" />
            } @else {
              <ion-icon name="log-in-outline" />
            }
            <span>{{ loading() ? 'Entrando…' : 'Entrar com Google' }}</span>
          </button>
          @if (error(); as message) {
            <p role="alert" class="error">{{ message }}</p>
          }
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './login.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.router.navigate(['/admin']);
      }
    });
  }

  async signIn(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const { error } = await this.auth.signInWithGoogle();
    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
    }
  }
}
