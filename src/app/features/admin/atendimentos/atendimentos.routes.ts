import { Routes } from '@angular/router';

export const atendimentosRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/atendimentos-list').then((m) => m.AtendimentosListPage),
  },
  {
    path: 'novo',
    loadComponent: () =>
      import('./pages/novo-atendimento-page').then(
        (m) => m.NovoAtendimentoPage,
      ),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/atendimento-detail').then(
        (m) => m.AtendimentoDetailPage,
      ),
  },
];
