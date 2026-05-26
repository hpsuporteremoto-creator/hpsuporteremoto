import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'hp-perfil-page',
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, MatToolbarModule],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Meu perfil</span>
    </mat-toolbar>

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="profile">
          <div class="avatar">
            @if (avatarUrl(); as url) {
              <img [src]="url" alt="" referrerpolicy="no-referrer" />
            } @else {
              <mat-icon>account_circle</mat-icon>
            }
          </div>

          <div class="info">
            <h1>{{ displayName() }}</h1>
            <p>{{ auth.user()?.email }}</p>
            <span class="role-chip">
              <mat-icon>{{ auth.isAdmin() ? 'workspace_premium' : 'point_of_sale' }}</mat-icon>
              {{ auth.isAdmin() ? 'Admin' : 'Vendedor' }}
            </span>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="filled">
        <mat-card-content class="details">
          <p>
            <mat-icon>mail</mat-icon>
            <span>Email</span>
            <strong>{{ auth.user()?.email }}</strong>
          </p>
          <p>
            <mat-icon>login</mat-icon>
            <span>Último login</span>
            <strong>{{ auth.user()?.last_sign_in_at | date: 'short' }}</strong>
          </p>
          <p>
            <mat-icon>event</mat-icon>
            <span>Criado em</span>
            <strong>{{ auth.user()?.created_at | date: 'short' }}</strong>
          </p>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: `
    :host
      display: block
    .content
      width: min(42rem, calc(100% - 2rem))
      margin: 0 auto
      padding: 1rem 0 2rem
      display: grid
      gap: 1rem
    mat-card
      background: var(--mat-sys-surface-container)
    .profile
      display: flex
      align-items: center
      gap: 1rem
      padding: 1.25rem !important
    .avatar
      width: 4.5rem
      height: 4.5rem
      border-radius: 50%
      overflow: hidden
      background: var(--mat-sys-surface-container-high)
      display: flex
      align-items: center
      justify-content: center
      flex-shrink: 0
    .avatar img
      width: 100%
      height: 100%
      object-fit: cover
    .avatar mat-icon
      width: 4rem
      height: 4rem
      font-size: 4rem
      color: var(--mat-sys-on-surface-variant)
    .info
      min-width: 0
    h1
      margin: 0
      font-size: 1.5rem
      line-height: 1.2
    .info p
      margin: 0.25rem 0 0.75rem
      color: var(--mat-sys-on-surface-variant)
      overflow-wrap: anywhere
    .role-chip
      display: inline-flex
      align-items: center
      gap: 0.35rem
      padding: 0.35rem 0.65rem
      border-radius: 999px
      background: rgba(255, 181, 17, 0.16)
      color: #ffb511
      font-weight: 700
      font-size: 0.8125rem
    .role-chip mat-icon
      width: 1rem
      height: 1rem
      font-size: 1rem
    .details
      display: grid
      gap: 0.75rem
      padding: 1.25rem !important
    .details p
      margin: 0
      display: grid
      grid-template-columns: auto minmax(7rem, 10rem) minmax(0, 1fr)
      gap: 0.75rem
      align-items: center
    .details mat-icon
      color: var(--mat-sys-primary)
    .details span
      color: var(--mat-sys-on-surface-variant)
    .details strong
      min-width: 0
      overflow-wrap: anywhere
    @media (max-width: 560px)
      .profile
        align-items: flex-start
      .details p
        grid-template-columns: auto minmax(0, 1fr)
      .details strong
        grid-column: 2
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PerfilPage {
  protected readonly auth = inject(AuthService);
  private readonly location = inject(Location);

  protected readonly displayName = computed(() => {
    const user = this.auth.user();
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const name = metadata?.['full_name'] ?? metadata?.['name'];
    return typeof name === 'string' && name.trim() ? name : (user?.email ?? 'Usuário');
  });
  protected readonly avatarUrl = computed(() => {
    const metadata = this.auth.user()?.user_metadata as Record<string, unknown> | undefined;
    const avatar = metadata?.['avatar_url'] ?? metadata?.['picture'];
    return typeof avatar === 'string' && avatar.trim() ? avatar : null;
  });

  voltar(): void {
    this.location.back();
  }
}
