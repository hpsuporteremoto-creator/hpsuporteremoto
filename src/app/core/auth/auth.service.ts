import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';

export type AuthRole = 'admin' | 'vendedor' | null;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _session = signal<Session | null>(null);
  // Fonte única de autorização: auth.users.app_metadata.role/is_admin.
  private readonly _role = signal<AuthRole>(null);
  private _profileFetch: Promise<void> = Promise.resolve();
  private lastAccessRecordKey: string | null = null;
  readonly session = this._session.asReadonly();
  readonly user = computed<User | null>(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly role = this._role.asReadonly();
  readonly isAdmin = computed(() => this._role() === 'admin');
  readonly isVendedor = computed(() => this._role() === 'vendedor');
  readonly isStaff = computed(() => this._role() !== null);

  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      if (!this.isBrowser) {
        resolve();
        return;
      }

      this.supabase.auth.getSession().then(async ({ data }) => {
        this._session.set(data.session);
        this.recordAccess(data.session);
        await this.refreshProfileFlag();
        resolve();
      });

      this.supabase.auth.onAuthStateChange((_event, session) => {
        this._session.set(session);
        this.recordAccess(session);
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
      options: {
        redirectTo,
        queryParams: {
          prompt: 'login',
          max_age: '0',
        },
      },
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
   * Refetch do role de `auth.users.app_metadata` para o usuário atual.
   * Disparado no boot e a cada mudança de sessão; pode ser chamado
   * manualmente (ex: após o próprio usuário ser promovido) e aguardado via
   * profileFlagReady().
   */
  async refreshProfileFlag(): Promise<void> {
    const fetchPromise = (async () => {
      const userId = this.user()?.id;
      if (!userId) {
        this._role.set(null);
        return;
      }
      const { data } = await this.supabase.auth.getUser();
      const user = data.user;
      if (user?.id === userId) {
        const session = this._session();
        if (session) this._session.set({ ...session, user });
        this._role.set(resolveRole(user.app_metadata));
        return;
      }
      this._role.set(null);
    })();
    this._profileFetch = fetchPromise;
    return fetchPromise;
  }

  /** Aguarda o fetch mais recente do role — use após login pra evitar race. */
  profileFlagReady(): Promise<void> {
    return this._profileFetch;
  }

  private recordAccess(session: Session | null): void {
    if (!this.isBrowser || !session?.access_token || !session.user?.id) return;
    const fiveMinuteBucket = Math.floor(Date.now() / 300000);
    const recordKey = `${session.user.id}:${fiveMinuteBucket}`;
    if (this.lastAccessRecordKey === recordKey) return;
    this.lastAccessRecordKey = recordKey;

    void fetch('/api/record-login', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => {
      if (this.lastAccessRecordKey === recordKey) {
        this.lastAccessRecordKey = null;
      }
    });
  }
}

function resolveRole(metadata: unknown): AuthRole {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  const role = record['role'];
  const isAdmin = record['is_admin'];
  if (role === 'admin' || isAdmin === true || isAdmin === 'true') return 'admin';
  if (role === 'vendedor') return 'vendedor';
  return null;
}
