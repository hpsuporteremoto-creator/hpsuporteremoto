import { Injector, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.ready;
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const injector = inject(Injector);
  await auth.ready;
  if (auth.isAdmin()) {
    // Bootstrap admin realtime channel (notificação de novas solicitações)
    // a primeira vez que admin entra em qualquer rota /admin/*. Construção
    // lazy do singleton; chamadas subsequentes são no-op.
    const { AtendimentosService } = await import(
      '../../features/admin/atendimentos/atendimentos.service'
    );
    injector.get(AtendimentosService);
    return true;
  }
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
  return router.createUrlTree(['/']);
};
