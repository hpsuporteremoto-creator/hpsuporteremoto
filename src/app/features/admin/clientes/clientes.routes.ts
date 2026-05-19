import { Routes } from '@angular/router';

export const clientesRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/clientes-list').then((m) => m.ClientesListPage),
  },
  {
    path: 'novo',
    loadComponent: () =>
      import('./pages/cliente-form').then((m) => m.ClienteFormPage),
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/cliente-form').then((m) => m.ClienteFormPage),
  },
];
