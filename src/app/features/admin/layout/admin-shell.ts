import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BreakpointObserver } from '@angular/cdk/layout';
import {
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../core/auth/auth.service';

interface AdminNavItem {
  readonly label: string;
  readonly icon: string;
  readonly route: readonly string[];
  readonly exact: boolean;
}

@Component({
  selector: 'hp-admin-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatSidenavModule,
    MatTooltipModule,
  ],
  template: `
    <mat-drawer-container
      class="admin-shell"
      [class.is-drawer-open]="drawerOpen()"
      [class.is-drawer-close]="!drawerOpen()"
      autosize
      (backdropClick)="closeDrawer()"
    >
      <mat-drawer
        class="drawer"
        aria-label="Navegação administrativa"
        [mode]="drawerMode()"
        [opened]="drawerOpened()"
        [disableClose]="!isMobile()"
      >
        <div class="brand">
          <button
            mat-icon-button
            type="button"
            class="drawer-toggle"
            (click)="toggleDrawer()"
            [attr.aria-label]="drawerOpen() ? 'Recolher menu' : 'Expandir menu'"
            [attr.aria-expanded]="drawerOpen()"
            matTooltip="Menu"
          >
            <mat-icon>{{ drawerOpen() ? 'menu_open' : 'menu' }}</mat-icon>
          </button>
          <div class="brand-copy" aria-hidden="true">
            <strong>HP suporte</strong>
            <span>Admin</span>
          </div>
        </div>

        <nav class="nav-list">
          @for (item of navItems(); track item.label) {
            <a
              class="nav-link"
              [routerLink]="item.route"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.exact }"
              [attr.aria-label]="item.label"
              [matTooltip]="drawerOpen() ? '' : item.label"
              [matTooltipDisabled]="drawerOpen()"
              matTooltipPosition="right"
              (click)="closeOnMobile()"
            >
              <mat-icon>{{ item.icon }}</mat-icon>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="drawer-footer">
          @if (auth.user(); as user) {
            <div class="user-chip">
              <mat-icon>account_circle</mat-icon>
              <span>{{ user.email }}</span>
            </div>
          }
          <button
            mat-icon-button
            type="button"
            class="sign-out"
            (click)="signOut()"
            aria-label="Sair"
            matTooltip="Sair"
            matTooltipPosition="right"
          >
            <mat-icon>logout</mat-icon>
          </button>
        </div>
      </mat-drawer>

      <mat-drawer-content class="main-area">
        <header class="topbar">
          <button
            mat-icon-button
            type="button"
            class="mobile-toggle"
            (click)="openDrawer()"
            aria-label="Abrir menu"
          >
            <mat-icon>menu</mat-icon>
          </button>
          <div class="page-title">
            <span>Painel administrativo</span>
            <small>Operação, atendimento e cobrança</small>
          </div>
        </header>

        <router-outlet />
      </mat-drawer-content>
    </mat-drawer-container>
  `,
  styleUrl: './admin-shell.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminShell {
  protected readonly auth = inject(AuthService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);

  protected readonly isMobile = signal(false);
  protected readonly drawerOpen = signal(true);
  protected readonly drawerMode = computed<'over' | 'side'>(() =>
    this.isMobile() ? 'over' : 'side',
  );
  protected readonly drawerOpened = computed(() =>
    this.isMobile() ? this.drawerOpen() : true,
  );

  private readonly adminNavItems: ReadonlyArray<AdminNavItem> = [
    { label: 'Início', icon: 'space_dashboard', route: ['./'], exact: true },
    {
      label: 'Atendimentos',
      icon: 'support_agent',
      route: ['./atendimentos'],
      exact: false,
    },
    { label: 'Clientes', icon: 'groups', route: ['./clientes'], exact: false },
    {
      label: 'Contratos',
      icon: 'description',
      route: ['./contratos'],
      exact: false,
    },
    {
      label: 'Serviços',
      icon: 'design_services',
      route: ['./servicos'],
      exact: false,
    },
    {
      label: 'Financeiro',
      icon: 'payments',
      route: ['./financeiro'],
      exact: false,
    },
    {
      label: 'Perfil',
      icon: 'account_circle',
      route: ['./perfil'],
      exact: false,
    },
    {
      label: 'Usuários',
      icon: 'manage_accounts',
      route: ['./usuarios'],
      exact: false,
    },
  ];
  private readonly vendedorNavItems: ReadonlyArray<AdminNavItem> = [
    {
      label: 'Atendimentos',
      icon: 'support_agent',
      route: ['./atendimentos'],
      exact: false,
    },
    {
      label: 'Clientes',
      icon: 'groups',
      route: ['./clientes'],
      exact: false,
    },
    {
      label: 'Contratos',
      icon: 'description',
      route: ['./contratos'],
      exact: false,
    },
    {
      label: 'Serviços',
      icon: 'design_services',
      route: ['./servicos'],
      exact: false,
    },
    {
      label: 'Perfil',
      icon: 'account_circle',
      route: ['./perfil'],
      exact: false,
    },
  ];
  protected readonly navItems = computed(() =>
    this.auth.isAdmin() ? this.adminNavItems : this.vendedorNavItems,
  );

  constructor() {
    this.breakpointObserver
      .observe('(max-width: 760px)')
      .pipe(takeUntilDestroyed())
      .subscribe(({ matches }) => {
        this.isMobile.set(matches);
        this.drawerOpen.set(!matches);
      });
  }

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  openDrawer(): void {
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  closeOnMobile(): void {
    if (this.isMobile()) {
      this.closeDrawer();
    }
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
