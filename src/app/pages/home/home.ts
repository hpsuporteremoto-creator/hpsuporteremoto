import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  template: `
    <main>
      <header>
        <h1>HP suporte remoto</h1>
        <nav>
          @if (auth.isAdmin()) {
            <a routerLink="/admin">Painel admin</a>
          }
          <button type="button" (click)="signOut()">Sair</button>
        </nav>
      </header>
      @if (auth.user(); as user) {
        <p>Conectado como <strong>{{ user.email }}</strong>.</p>
      }
    </main>
  `,
  styles: `
    main { max-width: 56rem; margin: 2rem auto; padding: 0 1rem; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
    nav { display: flex; gap: 1rem; align-items: center; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
