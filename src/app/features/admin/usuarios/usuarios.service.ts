import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { SupabaseService } from '../../../core/supabase/supabase.service';
import {
  UserCreateInput,
  UserProfile,
  UserUpdateInput,
} from './usuarios.types';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);
  private readonly table = 'profiles';

  async list(): Promise<UserProfile[]> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as UserProfile[];
  }

  async get(id: string): Promise<UserProfile | null> {
    const { data, error } = await this.supabase
      .from(this.table)
      .select('*')
      .eq('id', id)
      .maybeSingle<UserProfile>();
    if (error) throw new Error(error.message);
    return data;
  }

  async update(id: string, input: UserUpdateInput): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .update({ full_name: input.full_name })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  /**
   * Promove ou rebaixa o usuário a admin. O trigger `profiles_guard_is_admin`
   * no banco garante que só admins consigam executar essa atualização.
   */
  async setAdmin(id: string, isAdmin: boolean): Promise<void> {
    const { error } = await this.supabase
      .from(this.table)
      .update({ is_admin: isAdmin })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async create(
    input: UserCreateInput,
  ): Promise<{ user: { id: string; email: string } }> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/create-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ email: input.email }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      user?: { id: string; email: string };
    };
    if (!response.ok || !payload.user) {
      throw new Error(
        toUsuarioErrorMessage(payload.error ?? `Erro ${response.status}`),
      );
    }
    return { user: payload.user };
  }

  async remove(user_id: string): Promise<void> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/delete-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
  }
}

function toUsuarioErrorMessage(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('email address') &&
    normalized.includes('already') &&
    normalized.includes('registered')
  ) {
    return 'Já existe um usuário cadastrado com este email.';
  }
  if (normalized.includes('user already registered')) {
    return 'Já existe um usuário cadastrado com este email.';
  }
  return message;
}
