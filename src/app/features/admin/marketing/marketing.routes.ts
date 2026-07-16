import { Routes } from '@angular/router';

export const marketingRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/marketing-list').then((m) => m.MarketingListPage),
  },
  {
    path: 'nova',
    loadComponent: () => import('./pages/marketing-form').then((m) => m.MarketingFormPage),
  },
  {
    path: ':id/reenviar',
    loadComponent: () => import('./pages/marketing-form').then((m) => m.MarketingFormPage),
  },
];
