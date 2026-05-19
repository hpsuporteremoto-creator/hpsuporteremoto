import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/admin-home').then((m) => m.AdminHome),
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./pages/criar-usuario').then((m) => m.CriarUsuarioPage),
  },
];
