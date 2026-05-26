import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'hp-login',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <main class="login-wrap">
      <mat-card class="login-card" appearance="filled">
        <mat-card-content class="login-content">
          <h1>HP suporte remoto</h1>
          <p class="hint">
            Entre com sua conta Google.
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
              <mat-icon>login</mat-icon>
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
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.auth.profileFlagReady().then(() => {
          const target = this.resolveTarget();
          if (target.startsWith('/admin') && !this.auth.isStaff()) {
            this.error.set('Seu usuário não tem acesso ao sistema.');
            void this.auth.signOut();
            return;
          }
          this.router.navigateByUrl(target);
        });
      }
    });
  }

  async signIn(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    const { error } = await this.auth.signInWithGoogle(returnUrl);
    if (error) {
      this.error.set(error.message);
      this.loading.set(false);
    }
  }

  /**
   * Honra `?returnUrl=` quando for um path interno. Cliente comum pode voltar
   * para a vitrine; `/admin` continua exigindo role operacional.
   */
  private resolveTarget(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    if (
      returnUrl &&
      returnUrl.startsWith('/') &&
      !returnUrl.startsWith('//')
    ) {
      return returnUrl;
    }
    return '/';
  }
}
