import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../../../core/auth/auth.service';

interface AdminShortcut {
  readonly label: string;
  readonly icon: string;
  readonly route: string | null;
}

@Component({
  selector: 'hp-admin-home',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary" class="topbar">
      <span class="title">HP suporte remoto · Admin</span>
      <span class="spacer"></span>
      @if (auth.user(); as user) {
        <span class="user-email">{{ user.email }}</span>
      }
      <button
        mat-icon-button
        type="button"
        (click)="signOut()"
        aria-label="Sair"
      >
        <mat-icon>logout</mat-icon>
      </button>
    </mat-toolbar>

    <main class="content">
      <div class="grid">
        @for (item of shortcuts; track item.label) {
          <mat-card
            class="shortcut"
            appearance="filled"
            [class.disabled]="!item.route"
          >
            @if (item.route) {
              <a [routerLink]="item.route" class="shortcut-link">
                <mat-icon class="shortcut-icon">{{ item.icon }}</mat-icon>
                <span class="shortcut-label">{{ item.label }}</span>
              </a>
            } @else {
              <span class="shortcut-link">
                <mat-icon class="shortcut-icon">{{ item.icon }}</mat-icon>
                <span class="shortcut-label">{{ item.label }}</span>
                <small>em breve</small>
              </span>
            }
          </mat-card>
        }
      </div>
    </main>
  `,
  styleUrl: './admin-home.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHome {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly shortcuts: ReadonlyArray<AdminShortcut> = [
    { label: 'Criar usuário', icon: 'person_add', route: 'usuarios' },
    { label: 'Clientes', icon: 'groups', route: null },
    { label: 'Serviços', icon: 'design_services', route: null },
    { label: 'Financeiro', icon: 'payments', route: null },
    { label: 'Atendimentos', icon: 'support_agent', route: null },
  ];

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
