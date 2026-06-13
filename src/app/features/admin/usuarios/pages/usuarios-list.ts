import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../../../core/auth/auth.service';
import { UsuariosService } from '../usuarios.service';
import { UserProfile } from '../usuarios.types';

@Component({
  selector: 'hp-usuarios-list',
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
      <span>Usuários</span>
      <span class="spacer"></span>
      <a mat-flat-button color="primary" routerLink="novo" aria-label="Novo usuário">
        <mat-icon>person_add</mat-icon>
        <span>Novo usuário</span>
      </a>
    </mat-toolbar>

    @if (loading() || updating()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (usuarios(); as list) {
        @if (list.length === 0) {
          <p class="empty">Nenhum usuário cadastrado.</p>
        } @else {
          <div class="list">
            @for (u of list; track u.id) {
              <mat-card
                class="usuario-card"
                appearance="filled"
                tabindex="0"
                role="link"
                [attr.aria-label]="'Ver usuário ' + (u.full_name || u.email)"
                [routerLink]="[u.id]"
              >
                <mat-card-content class="row">
                  <div class="avatar">
                    @if (u.avatar_url) {
                      <img [src]="u.avatar_url" alt="" referrerpolicy="no-referrer" />
                    } @else {
                      <span class="initials">{{ initials(u) }}</span>
                    }
                  </div>
                  <div class="info">
                    <strong class="nome">{{ u.full_name || '—' }}</strong>
                    <small class="email">{{ u.email }}</small>
                    <span
                      class="role-chip"
                      [class.role-admin]="isAdmin(u)"
                      [class.role-vendedor]="u.role === 'vendedor'"
                      [class.role-empty]="!isAdmin(u) && u.role !== 'vendedor'"
                    >
                      <mat-icon aria-hidden="true">{{ roleIcon(u) }}</mat-icon>
                      <span>{{ roleLabel(u) }}</span>
                    </span>
                    <div
                      class="access-panel"
                      [class.access-panel-empty]="!hasAccessDevice(u)"
                      aria-label="Dados de acesso"
                    >
                      <span class="access-title">
                        <mat-icon aria-hidden="true">devices</mat-icon>
                        <span>Acesso</span>
                      </span>
                      <span class="access-line">
                        <mat-icon aria-hidden="true">schedule</mat-icon>
                        <span>
                          @if (u.last_access_at) {
                            {{ u.last_access_at | date: 'short' }}
                          } @else {
                            Nunca registrado
                          }
                        </span>
                      </span>
                      <span class="access-line">
                        <mat-icon aria-hidden="true">desktop_windows</mat-icon>
                        <span>{{ machineLabel(u) }}</span>
                      </span>
                      @if (u.last_access_ip) {
                        <span class="access-line">
                          <mat-icon aria-hidden="true">public</mat-icon>
                          <span>{{ u.last_access_ip }}</span>
                        </span>
                      }
                    </div>
                  </div>
                  <div class="actions">
                    <a
                      mat-icon-button
                      [routerLink]="[u.id, 'editar']"
                      (click)="$event.stopPropagation()"
                      aria-label="Editar"
                    >
                      <mat-icon>edit</mat-icon>
                    </a>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="apagar(u); $event.stopPropagation()"
                      [disabled]="!canDelete(u) || updating()"
                      [attr.aria-label]="canDelete(u) ? 'Apagar' : 'Não pode apagar admin'"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>
        }
      }
    </main>
  `,
  styleUrl: './usuarios-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuariosListPage {
  private readonly svc = inject(UsuariosService);
  private readonly auth = inject(AuthService);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly usuarios = signal<UserProfile[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly updating = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  isAdmin(u: UserProfile): boolean {
    return u.role === 'admin' || u.is_admin;
  }

  canDelete(u: UserProfile): boolean {
    if (this.isAdmin(u)) return false;
    return u.id !== this.auth.user()?.id;
  }

  roleLabel(u: UserProfile): string {
    if (this.isAdmin(u)) return 'ADMIN';
    if (u.role === 'vendedor') return 'VENDEDOR';
    return 'SEM ACESSO';
  }

  roleIcon(u: UserProfile): string {
    if (this.isAdmin(u)) return 'workspace_premium';
    if (u.role === 'vendedor') return 'point_of_sale';
    return 'person_off';
  }

  hasAccessDevice(u: UserProfile): boolean {
    return Boolean(u.last_access_device || u.last_access_ip || u.last_access_country);
  }

  machineLabel(u: UserProfile): string {
    const parts = [
      u.last_access_device,
      u.last_access_country ? `País ${u.last_access_country}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'Máquina aguardando registro';
  }

  initials(u: UserProfile): string {
    const source = u.full_name ?? u.email;
    return source.trim().charAt(0).toUpperCase() || '?';
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.svc.list();
      this.usuarios.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar usuários');
    } finally {
      this.loading.set(false);
    }
  }

  async apagar(u: UserProfile): Promise<void> {
    if (!this.canDelete(u)) return;
    const ok = confirm(`Apagar ${u.full_name || u.email}? Esta ação não pode ser desfeita.`);
    if (!ok) return;

    this.updating.set(true);
    try {
      await this.svc.remove(u.id);
      this.usuarios.update((list) => list?.filter((x) => x.id !== u.id) ?? null);
      this.snackBar.open('Usuário apagado', 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }
}
