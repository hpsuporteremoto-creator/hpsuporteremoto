import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey,
    {
      auth: {
        persistSession: this.isBrowser,
        autoRefreshToken: this.isBrowser,
        detectSessionInUrl: this.isBrowser,
        storage: this.isBrowser ? window.sessionStorage : undefined,
      },
    },
  );
}
