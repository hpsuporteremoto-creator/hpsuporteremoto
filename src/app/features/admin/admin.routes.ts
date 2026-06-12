import { Routes } from '@angular/router';
import { adminOnlyGuard } from '../../core/auth/auth.guard';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layout/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [adminOnlyGuard],
        loadComponent: () =>
          import('./dashboard/pages/admin-dashboard').then((m) => m.AdminDashboardPage),
      },
      {
        path: 'usuarios',
        canActivate: [adminOnlyGuard],
        loadChildren: () => import('./usuarios/usuarios.routes').then((m) => m.usuariosRoutes),
      },
      {
        path: 'clientes',
        loadChildren: () => import('./clientes/clientes.routes').then((m) => m.clientesRoutes),
      },
      {
        path: 'servicos',
        loadChildren: () => import('./servicos/servicos.routes').then((m) => m.servicosRoutes),
      },
      {
        path: 'atendimentos',
        loadChildren: () =>
          import('./atendimentos/atendimentos.routes').then((m) => m.atendimentosRoutes),
      },
      {
        path: 'financeiro',
        canActivate: [adminOnlyGuard],
        loadChildren: () =>
          import('./financeiro/financeiro.routes').then((m) => m.financeiroRoutes),
      },
      {
        path: 'perfil',
        loadComponent: () => import('./perfil/perfil-page').then((m) => m.PerfilPage),
      },
    ],
  },
];
