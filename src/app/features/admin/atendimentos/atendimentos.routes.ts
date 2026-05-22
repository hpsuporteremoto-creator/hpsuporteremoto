import { Routes } from '@angular/router';

export const atendimentosRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/atendimentos-list').then((m) => m.AtendimentosListPage),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/atendimento-detail').then(
        (m) => m.AtendimentoDetailPage,
      ),
  },
];
