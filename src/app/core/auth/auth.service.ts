import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { isAdminEmail } from './admin-emails';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();
  readonly user = computed<User | null>(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => isAdminEmail(this.user()?.email));

  readonly ready: Promise<void>;

  constructor() {
    this.ready = new Promise<void>((resolve) => {
      if (!this.isBrowser) {
        resolve();
        return;
      }

      this.supabase.auth.getSession().then(({ data }) => {
        this._session.set(data.session);
        resolve();
      });

      this.supabase.auth.onAuthStateChange((_event, session) => {
        this._session.set(session);
      });
    });
  }

  signInWithGoogle() {
    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: this.isBrowser ? `${window.location.origin}/` : undefined,
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
}
