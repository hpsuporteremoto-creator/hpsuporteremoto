import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/auth.guard';

/** Legacy routes kept for `ng serve` and old local entrypoints. */
export const routes: Routes = [
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
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadChildren: () =>
      import('./features/admin/admin.routes').then((m) => m.adminRoutes),
  },
  { path: '**', redirectTo: '' },
];
