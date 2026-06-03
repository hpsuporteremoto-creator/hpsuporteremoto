import { Routes } from '@angular/router';

export const contratosRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/contratos-list').then((m) => m.ContratosListPage),
  },
  {
    path: 'novo',
    loadComponent: () => import('./pages/contrato-form').then((m) => m.ContratoFormPage),
  },
  {
    path: ':id/editar',
    loadComponent: () => import('./pages/contrato-form').then((m) => m.ContratoFormPage),
  },
];
