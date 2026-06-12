import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { filter } from 'rxjs';
import { VersionBadge } from './shared/version-badge';

const JIVO_SCRIPT_ID = 'jivo-chat-widget';
const JIVO_SCRIPT_SRC = 'https://code.jivosite.com/widget/QblmcAIALk';
const JIVO_BLOCKED_ROUTE_CLASS = 'is-jivo-blocked-route';
const JIVO_SELECTOR = [
  `#${JIVO_SCRIPT_ID}`,
  'script[src*="jivosite.com"]',
  'script[src*="jivo"]',
  'iframe[src*="jivosite.com"]',
  'iframe[src*="jivo"]',
  '[id*="jivo"]',
  '[class*="jivo"]',
  '[id*="Jivo"]',
  '[class*="Jivo"]',
  '[data-jivo]',
].join(',');

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, VersionBadge],
  template: `
    <router-outlet />
    <hp-version-badge />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private jivoBlockerObserver: MutationObserver | null = null;

  constructor() {
    // Faz <mat-icon> usar Material Symbols Outlined (MD3) por padrão.
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');

    this.syncJivoWidget(this.currentPathname());
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.syncJivoWidget(event.urlAfterRedirects));
  }

  private syncJivoWidget(url: string): void {
    if (!this.isStorefrontRoute(url)) {
      this.setJivoBlockedRouteClass(true);
      this.startJivoBlocker();
      this.removeJivoWidget();
      return;
    }

    this.setJivoBlockedRouteClass(false);
    this.stopJivoBlocker();
    this.loadJivoWidget();
  }

  private isStorefrontRoute(url: string): boolean {
    const pathname = url.split('?')[0]?.split('#')[0] ?? '';
    return (
      pathname === '/' ||
      pathname === '/meus-pedidos' ||
      pathname.startsWith('/catalogo/') ||
      pathname.startsWith('/servicos/')
    );
  }

  private currentPathname(): string {
    return this.document.defaultView?.location.pathname ?? this.router.url;
  }

  private loadJivoWidget(): void {
    if (this.document.getElementById(JIVO_SCRIPT_ID)) return;
    const body = this.document.body;
    if (!body) return;

    const script = this.document.createElement('script');
    script.id = JIVO_SCRIPT_ID;
    script.src = JIVO_SCRIPT_SRC;
    script.async = true;
    body.append(script);
  }

  private removeJivoWidget(): void {
    this.callJivoMethod('close');
    this.callJivoMethod('hideWidget');

    this.document.querySelectorAll(JIVO_SELECTOR).forEach((element) => element.remove());
    this.clearJivoGlobals();
  }

  private startJivoBlocker(): void {
    if (this.jivoBlockerObserver) return;

    this.jivoBlockerObserver = new MutationObserver(() => this.removeJivoWidget());
    this.jivoBlockerObserver.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  private stopJivoBlocker(): void {
    this.jivoBlockerObserver?.disconnect();
    this.jivoBlockerObserver = null;
  }

  private setJivoBlockedRouteClass(blocked: boolean): void {
    const body = this.document.body;
    if (!body) return;
    body.classList.toggle(JIVO_BLOCKED_ROUTE_CLASS, blocked);
  }

  private callJivoMethod(methodName: 'close' | 'hideWidget'): void {
    const windowRef = this.document.defaultView as (Window & { jivo_api?: unknown }) | null;
    const api = windowRef?.jivo_api;
    if (!api || typeof api !== 'object') return;

    const method = (api as Record<string, unknown>)[methodName];
    if (typeof method !== 'function') return;

    try {
      method.call(api);
    } catch {
      // O widget é externo; se a API estiver em transição, a remoção do DOM ainda resolve.
    }
  }

  private clearJivoGlobals(): void {
    const windowRef = this.document.defaultView as
      | (Window & {
          jivo_api?: unknown;
          jivo_config?: unknown;
          jivo_init?: unknown;
        })
      | null;
    if (!windowRef) return;

    delete windowRef.jivo_api;
    delete windowRef.jivo_config;
    delete windowRef.jivo_init;
  }
}
