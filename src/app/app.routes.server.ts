import { RenderMode, ServerRoute } from '@angular/ssr';

// App é auth-restrito; renderizamos no cliente para evitar mismatch
// entre sessão (browser) e estado SSR (sempre deslogado).
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client,
  },
];
