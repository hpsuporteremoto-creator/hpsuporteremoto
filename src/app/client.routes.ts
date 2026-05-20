import { Routes } from '@angular/router';
import { adminGuard } from './core/auth/auth.guard';

export const clientRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'admin',
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
  { path: '**', redirectTo: 'admin' },
];
