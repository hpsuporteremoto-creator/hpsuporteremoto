import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main>
      <header>
        <h1>Painel admin</h1>
        <a routerLink="/">Voltar</a>
      </header>

      <section>
        <h2>Criar novo usuário</h2>
        <p>
          Adicione um email para conceder acesso. A pessoa entra no sistema usando
          a conta Google associada a esse email.
        </p>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            formControlName="email"
            autocomplete="off"
            required
          />
          <button type="submit" [disabled]="form.invalid || loading()">
            @if (loading()) { Criando… } @else { Criar usuário }
          </button>
        </form>

        @if (successEmail(); as email) {
          <p role="status">Usuário <strong>{{ email }}</strong> criado.</p>
        }
        @if (error(); as message) {
          <p role="alert" class="error">{{ message }}</p>
        }
      </section>
    </main>
  `,
  styles: `
    main { max-width: 36rem; margin: 2rem auto; padding: 0 1rem; }
    header { display: flex; justify-content: space-between; align-items: center; }
    form { display: flex; flex-direction: column; gap: 0.5rem; max-width: 22rem; }
    input { padding: 0.5rem; font-size: 1rem; }
    button { padding: 0.5rem 1rem; cursor: pointer; }
    button:disabled { cursor: not-allowed; opacity: 0.6; }
    .error { color: #b00020; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly successEmail = signal<string | null>(null);

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    const email = this.form.getRawValue().email.trim();

    this.loading.set(true);
    this.error.set(null);
    this.successEmail.set(null);

    const token = await this.auth.getAccessToken();
    if (!token) {
      this.error.set('Sessão inválida. Faça login novamente.');
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

      this.successEmail.set(payload.user?.email ?? email);
      this.form.reset();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      this.loading.set(false);
    }
  }
}
