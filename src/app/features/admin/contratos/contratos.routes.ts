import { Routes } from '@angular/router';

export const contratosRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'novo',
  },
  {
    path: 'novo',
    loadComponent: () =>
      import('./pages/contrato-form').then((m) => m.ContratoFormPage),
  },
];
