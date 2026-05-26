import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _session = signal<Session | null>(null);
  // Fonte única de autorização administrativa: auth.users.app_metadata.is_admin.
  private readonly _profileIsAdmin = signal(false);
  private _profileFetch: Promise<void> = Promise.resolve();
  readonly session = this._session.asReadonly();
  readonly user = computed<User | null>(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this._profileIsAdmin());

  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      if (!this.isBrowser) {
        resolve();
        return;
      }

      this.supabase.auth.getSession().then(async ({ data }) => {
        this._session.set(data.session);
        await this.refreshProfileFlag();
        resolve();
      });

      this.supabase.auth.onAuthStateChange((_event, session) => {
        this._session.set(session);
        void this.refreshProfileFlag();
      });
    });
  }

  signInWithGoogle(returnUrl?: string | null) {
    let redirectTo: string | undefined;
    if (this.isBrowser) {
      const origin = window.location.origin;
      redirectTo =
        returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')
          ? `${origin}/login?returnUrl=${encodeURIComponent(returnUrl)}`
          : `${origin}/login`;
    }
    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

  async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /**
   * Refetch do flag `is_admin` de `auth.users.app_metadata` para o usuário atual.
   * Disparado no boot e a cada mudança de sessão; pode ser chamado
   * manualmente (ex: após o próprio usuário ser promovido) e aguardado via
   * profileFlagReady().
   */
  async refreshProfileFlag(): Promise<void> {
    const fetchPromise = (async () => {
      const userId = this.user()?.id;
      if (!userId) {
        this._profileIsAdmin.set(false);
        return;
      }
      const { data } = await this.supabase.auth.getUser();
      const user = data.user;
      if (user?.id === userId) {
        const session = this._session();
        if (session) this._session.set({ ...session, user });
        this._profileIsAdmin.set(isAdminMetadata(user.app_metadata));
        return;
      }
      this._profileIsAdmin.set(false);
    })();
    this._profileFetch = fetchPromise;
    return fetchPromise;
  }

  /** Aguarda o fetch mais recente do flag is_admin — use após login pra evitar race. */
  profileFlagReady(): Promise<void> {
    return this._profileFetch;
  }
}

function isAdminMetadata(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const value = (metadata as Record<string, unknown>)['is_admin'];
  return value === true || value === 'true';
}
