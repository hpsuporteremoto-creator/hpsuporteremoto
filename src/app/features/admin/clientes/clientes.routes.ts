import { Routes } from '@angular/router';
import { adminOnlyGuard } from '../../../core/auth/auth.guard';

export const clientesRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/clientes-list').then((m) => m.ClientesListPage),
  },
  {
    path: 'novo',
    canActivate: [adminOnlyGuard],
    loadComponent: () =>
      import('./pages/cliente-form').then((m) => m.ClienteFormPage),
  },
  {
    path: ':id/editar',
    canActivate: [adminOnlyGuard],
    loadComponent: () =>
      import('./pages/cliente-form').then((m) => m.ClienteFormPage),
  },
];
