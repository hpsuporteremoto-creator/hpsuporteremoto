import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
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
              <mat-card class="usuario-card" appearance="filled">
                <mat-card-content class="row">
                  <div class="avatar">
                    @if (u.avatar_url) {
                      <img
                        [src]="u.avatar_url"
                        alt=""
                        referrerpolicy="no-referrer"
                      />
                    } @else {
                      <span class="initials">{{ initials(u) }}</span>
                    }
                  </div>
                  <div class="info">
                    <strong class="nome">{{ u.full_name || '—' }}</strong>
                    <small class="email">{{ u.email }}</small>
                    <span class="admin-chip">{{ roleLabel(u) }}</span>
                  </div>
                  <div class="actions">
                    <a
                      mat-icon-button
                      [routerLink]="[u.id, 'editar']"
                      aria-label="Editar"
                    >
                      <mat-icon>edit</mat-icon>
                    </a>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="apagar(u)"
                      [disabled]="!canDelete(u) || updating()"
                      [attr.aria-label]="
                        canDelete(u) ? 'Apagar' : 'Não pode apagar admin'
                      "
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
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar usuários',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async apagar(u: UserProfile): Promise<void> {
    if (!this.canDelete(u)) return;
    const ok = confirm(
      `Apagar ${u.full_name || u.email}? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;

    this.updating.set(true);
    try {
      await this.svc.remove(u.id);
      this.usuarios.update(
        (list) => list?.filter((x) => x.id !== u.id) ?? null,
      );
      this.snackBar.open('Usuário apagado', 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.updating.set(false);
    }
  }
}
