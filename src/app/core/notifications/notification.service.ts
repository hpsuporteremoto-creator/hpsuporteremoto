import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type PermissionState = NotificationPermission | 'unsupported';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _permission = signal<PermissionState>(
    this.isBrowser && 'Notification' in window
      ? Notification.permission
      : 'unsupported',
  );

  readonly permission = this._permission.asReadonly();
  readonly canRequest = computed(() => this._permission() === 'default');
  readonly canNotify = computed(() => this._permission() === 'granted');

  async requestPermission(): Promise<PermissionState> {
    if (!this.isBrowser || !('Notification' in window)) return 'denied';
    const result = await Notification.requestPermission();
    this._permission.set(result);
    return result;
  }

  notify(
    title: string,
    body: string,
    options: { tag?: string } = {},
  ): void {
    if (!this.isBrowser || !this.canNotify()) return;
    try {
      new Notification(title, {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: options.tag,
      });
    } catch {
      // Alguns browsers em alguns contextos (Service Worker only) lançam.
      // Silenciar — notificação é best-effort.
    }
  }
}
