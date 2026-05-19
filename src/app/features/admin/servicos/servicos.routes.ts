import { Routes } from '@angular/router';

export const servicosRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/servicos-list').then((m) => m.ServicosListPage),
  },
  {
    path: 'novo',
    loadComponent: () =>
      import('./pages/servico-form').then((m) => m.ServicoFormPage),
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/servico-form').then((m) => m.ServicoFormPage),
  },
];
