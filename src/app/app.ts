import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatIconRegistry } from '@angular/material/icon';
import { filter } from 'rxjs';
import { VersionBadge } from './shared/version-badge';

const JIVO_SCRIPT_ID = 'jivo-chat-widget';
const JIVO_SCRIPT_SRC = 'https://code.jivosite.com/widget/QblmcAIALk';

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

  constructor() {
    // Faz <mat-icon> usar Material Symbols Outlined (MD3) por padrão.
    inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');

    this.syncJivoWidget(this.router.url);
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.syncJivoWidget(event.urlAfterRedirects));
  }

  private syncJivoWidget(url: string): void {
    if (this.isAdminRoute(url)) {
      this.removeJivoWidget();
      return;
    }

    this.loadJivoWidget();
  }

  private isAdminRoute(url: string): boolean {
    const pathname = url.split('?')[0]?.split('#')[0] ?? '';
    return pathname === '/admin' || pathname.startsWith('/admin/');
  }

  private loadJivoWidget(): void {
    if (this.document.getElementById(JIVO_SCRIPT_ID)) return;

    const script = this.document.createElement('script');
    script.id = JIVO_SCRIPT_ID;
    script.src = JIVO_SCRIPT_SRC;
    script.async = true;
    this.document.body.append(script);
  }

  private removeJivoWidget(): void {
    this.callJivoMethod('close');
    this.callJivoMethod('hideWidget');

    this.document
      .querySelectorAll(
        [
          `#${JIVO_SCRIPT_ID}`,
          'script[src*="jivosite.com"]',
          'iframe[src*="jivosite.com"]',
          '[id*="jivo"]',
          '[class*="jivo"]',
        ].join(','),
      )
      .forEach((element) => element.remove());
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
}
