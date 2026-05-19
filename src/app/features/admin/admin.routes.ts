import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/admin-home').then((m) => m.AdminHome),
  },
  {
    path: 'usuarios',
    loadComponent: () =>
      import('./pages/criar-usuario').then((m) => m.CriarUsuarioPage),
  },
  {
    path: 'clientes',
    loadChildren: () =>
      import('./clientes/clientes.routes').then((m) => m.clientesRoutes),
  },
  {
    path: 'servicos',
    loadChildren: () =>
      import('./servicos/servicos.routes').then((m) => m.servicosRoutes),
  },
  {
    path: 'atendimentos',
    loadChildren: () =>
      import('./atendimentos/atendimentos.routes').then(
        (m) => m.atendimentosRoutes,
      ),
  },
];
