import { Routes } from '@angular/router';

export const usuariosRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/usuarios-list').then((m) => m.UsuariosListPage),
  },
  {
    path: 'novo',
    loadComponent: () =>
      import('./pages/usuario-form').then((m) => m.UsuarioFormPage),
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/usuario-form').then((m) => m.UsuarioFormPage),
  },
];
