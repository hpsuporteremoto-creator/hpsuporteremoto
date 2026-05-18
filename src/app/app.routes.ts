import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/admin').then((m) => m.AdminComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((m) => m.HomeComponent),
  },
  { path: '**', redirectTo: '' },
];
