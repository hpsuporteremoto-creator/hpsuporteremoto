import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  template: `
    <main class="login">
      <h1>HP suporte remoto</h1>
      <p>Faça login com sua conta Google autorizada para acessar o sistema.</p>
      <button type="button" (click)="signIn()" [disabled]="loading()">
        @if (loading()) {
          Entrando…
        } @else {
          Entrar com Google
        }
      </button>
      @if (error(); as message) {
        <p role="alert" class="error">{{ message }}</p>
      }
    </main>
  `,
  styles: `
    .login {
      max-width: 28rem;
      margin: 4rem auto;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      text-align: center;
    }
    button {
      padding: 0.75rem 1.5rem;
      font-size: 1rem;
      cursor: pointer;
    }
    button:disabled { cursor: not-allowed; opacity: 0.6; }
    .error { color: #b00020; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.router.navigate(['/']);
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
