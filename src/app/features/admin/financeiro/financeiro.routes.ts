import { Routes } from '@angular/router';

export const financeiroRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/financeiro-list').then((m) => m.FinanceiroListPage),
  },
  {
    path: 'nova',
    loadComponent: () =>
      import('./pages/transacao-form').then((m) => m.TransacaoFormPage),
  },
  {
    path: 'recebedor-pix',
    loadComponent: () =>
      import('./pages/pix-recebedor-form').then((m) => m.PixRecebedorFormPage),
  },
];
