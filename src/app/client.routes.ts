import { Routes } from '@angular/router';

export const clientRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/atendimento/pages/atendimento-page').then(
        (m) => m.AtendimentoPage,
      ),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/login').then((m) => m.LoginPage),
  },
  { path: '**', redirectTo: '' },
];
