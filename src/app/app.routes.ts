import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/auth.guard';

/** Legacy routes kept for `ng serve` and old local entrypoints. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/vitrine/pages/vitrine-page').then((m) => m.VitrinePage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/pages/login').then((m) => m.LoginPage),
  },
  {
    path: 'meus-pedidos',
    loadComponent: () =>
      import('./features/vitrine/pages/meus-pedidos-page').then((m) => m.MeusPedidosPage),
  },
  {
    path: 'servicos/:id',
    loadComponent: () =>
      import('./features/vitrine/pages/servico-detail-page').then((m) => m.ServicoDetailPage),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () => import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  { path: '**', redirectTo: '' },
];
