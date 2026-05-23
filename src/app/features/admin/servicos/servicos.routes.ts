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
    path: 'categorias',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/servico-categorias-list').then(
        (m) => m.ServicoCategoriasListPage,
      ),
  },
  {
    path: 'categorias/nova',
    loadComponent: () =>
      import('./pages/servico-categoria-form').then(
        (m) => m.ServicoCategoriaFormPage,
      ),
  },
  {
    path: 'categorias/:id/editar',
    loadComponent: () =>
      import('./pages/servico-categoria-form').then(
        (m) => m.ServicoCategoriaFormPage,
      ),
  },
  {
    path: ':id/editar',
    loadComponent: () =>
      import('./pages/servico-form').then((m) => m.ServicoFormPage),
  },
];
