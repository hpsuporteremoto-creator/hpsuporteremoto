import { Routes } from '@angular/router';

export const adminRoutes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/admin-shell').then((m) => m.AdminShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./dashboard/pages/admin-dashboard').then(
            (m) => m.AdminDashboardPage,
          ),
      },
      {
        path: 'usuarios',
        loadChildren: () =>
          import('./usuarios/usuarios.routes').then((m) => m.usuariosRoutes),
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
      {
        path: 'financeiro',
        loadChildren: () =>
          import('./financeiro/financeiro.routes').then(
            (m) => m.financeiroRoutes,
          ),
      },
    ],
  },
];
