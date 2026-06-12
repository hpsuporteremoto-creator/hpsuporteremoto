import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { UsuariosService } from '../usuarios.service';
import { UserProfile } from '../usuarios.types';

@Component({
  selector: 'hp-usuario-detail',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Usuário</span>
      <span class="spacer"></span>
      @if (usuario(); as u) {
        <a mat-flat-button color="primary" [routerLink]="['editar']" aria-label="Editar usuário">
          <mat-icon>edit</mat-icon>
          <span>Editar usuário</span>
        </a>
      }
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (usuario(); as u) {
        <mat-card appearance="filled">
          <mat-card-content class="profile">
            <div class="avatar">
              @if (u.avatar_url) {
                <img [src]="u.avatar_url" alt="" referrerpolicy="no-referrer" />
              } @else {
                <span>{{ initials(u) }}</span>
              }
            </div>

            <div class="info">
              <h1>{{ displayName() }}</h1>
              <p>{{ u.email }}</p>
              <span
                class="role-chip"
                [class.role-admin]="isAdmin()"
                [class.role-vendedor]="u.role === 'vendedor'"
                [class.role-empty]="!isAdmin() && u.role !== 'vendedor'"
              >
                <mat-icon>{{ roleIcon() }}</mat-icon>
                {{ roleLabel() }}
              </span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card appearance="filled">
          <mat-card-content class="details">
            <p>
              <mat-icon>mail</mat-icon>
              <span>Email</span>
              <strong>{{ u.email }}</strong>
            </p>
            <p>
              <mat-icon>badge</mat-icon>
              <span>Nome</span>
              <strong>{{ u.full_name || 'Sem nome cadastrado' }}</strong>
            </p>
            <p>
              <mat-icon>admin_panel_settings</mat-icon>
              <span>Perfil</span>
              <strong>{{ roleLabel() }}</strong>
            </p>
            <p>
              <mat-icon>event</mat-icon>
              <span>Criado em</span>
              <strong>{{ u.created_at | date: 'short' }}</strong>
            </p>
            <p>
              <mat-icon>update</mat-icon>
              <span>Atualizado em</span>
              <strong>{{ u.updated_at | date: 'short' }}</strong>
            </p>
            <p>
              <mat-icon>schedule</mat-icon>
              <span>Último acesso</span>
              <strong>
                @if (u.last_access_at) {
                  {{ u.last_access_at | date: 'short' }}
                } @else {
                  Nunca registrado
                }
              </strong>
            </p>
            <p>
              <mat-icon>devices</mat-icon>
              <span>Máquina</span>
              <strong>{{ machineLabel(u) }}</strong>
            </p>
            @if (u.last_access_ip) {
              <p>
                <mat-icon>public</mat-icon>
                <span>IP</span>
                <strong>{{ u.last_access_ip }}</strong>
              </p>
            }
          </mat-card-content>
        </mat-card>
      }
    </main>
  `,
  styles: `
    :host
      display: block
    .spacer
      flex: 1
    .content
      width: min(42rem, calc(100% - 2rem))
      margin: 0 auto
      padding: 1rem 0 2rem
      display: grid
      gap: 1rem
    .error
      margin: 0
      color: var(--mat-sys-error)
      text-align: center
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
      background: var(--mat-sys-primary)
      display: flex
      align-items: center
      justify-content: center
      flex-shrink: 0
    .avatar img
      width: 100%
      height: 100%
      object-fit: cover
    .avatar span
      color: #fff
      font-size: 1.75rem
      font-weight: 700
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
      font-weight: 700
      font-size: 0.8125rem
    .role-chip mat-icon
      width: 1rem
      height: 1rem
      font-size: 1rem
    .role-admin
      background: rgba(255, 181, 17, 0.16)
      color: #ffb511
    .role-vendedor
      background: rgba(52, 211, 153, 0.16)
      color: #34d399
    .role-empty
      background: rgba(148, 163, 184, 0.16)
      color: #94a3b8
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
      mat-toolbar a span
        display: none
      .profile
        align-items: flex-start
      .details p
        grid-template-columns: auto minmax(0, 1fr)
      .details strong
        grid-column: 2
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioDetailPage {
  private readonly svc = inject(UsuariosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly usuario = signal<UserProfile | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isAdmin = computed(() => {
    const usuario = this.usuario();
    return usuario?.role === 'admin' || usuario?.is_admin === true;
  });
  protected readonly displayName = computed(() => {
    const usuario = this.usuario();
    return usuario?.full_name?.trim() || usuario?.email || 'Usuário';
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.carregar(id);
    }
  }

  voltar(): void {
    this.location.back();
  }

  initials(u: UserProfile): string {
    const source = u.full_name ?? u.email;
    return source.trim().charAt(0).toUpperCase() || '?';
  }

  roleLabel(): string {
    const usuario = this.usuario();
    if (this.isAdmin()) return 'Admin';
    if (usuario?.role === 'vendedor') return 'Vendedor';
    return 'Sem acesso';
  }

  roleIcon(): string {
    const usuario = this.usuario();
    if (this.isAdmin()) return 'workspace_premium';
    if (usuario?.role === 'vendedor') return 'point_of_sale';
    return 'person_off';
  }

  machineLabel(u: UserProfile): string {
    const parts = [
      u.last_access_device,
      u.last_access_country ? `País ${u.last_access_country}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'Máquina não registrada';
  }

  private async carregar(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const usuario = await this.svc.get(id);
      if (!usuario) {
        this.snackBar.open('Usuário não encontrado', 'OK', { duration: 4000 });
        void this.router.navigate(['/admin/usuarios']);
        return;
      }
      this.usuario.set(usuario);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar usuário');
    } finally {
      this.loading.set(false);
    }
  }
}
