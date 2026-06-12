import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

const JIVO_SCRIPT_ID = 'jivo-chat-widget';
const JIVO_SCRIPT_SRC = 'https://code.jivosite.com/widget/QblmcAIALk';
const JIVO_SELECTOR = [
  `#${JIVO_SCRIPT_ID}`,
  'script[src*="jivosite.com"]',
  'iframe[src*="jivosite.com"]',
  '[id*="jivo"]',
  '[class*="jivo"]',
  '[id*="Jivo"]',
  '[class*="Jivo"]',
  '[data-jivo]',
].join(',');

@Injectable({ providedIn: 'root' })
export class JivoChatService {
  private readonly document = inject(DOCUMENT);
  private activeConsumers = 0;

  activate(): void {
    this.activeConsumers += 1;
    this.load();
  }

  deactivate(): void {
    this.activeConsumers = Math.max(this.activeConsumers - 1, 0);
    if (this.activeConsumers === 0) {
      this.remove();
    }
  }

  private load(): void {
    if (this.document.getElementById(JIVO_SCRIPT_ID)) return;
    const body = this.document.body;
    if (!body) return;

    const script = this.document.createElement('script');
    script.id = JIVO_SCRIPT_ID;
    script.src = JIVO_SCRIPT_SRC;
    script.async = true;
    body.append(script);
  }

  private remove(): void {
    this.callJivoMethod('close');
    this.callJivoMethod('hideWidget');
    this.document.querySelectorAll(JIVO_SELECTOR).forEach((element) => element.remove());
    this.clearGlobals();
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
      // Widget externo: se a API estiver em transição, a remoção do DOM ainda resolve.
    }
  }

  private clearGlobals(): void {
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
