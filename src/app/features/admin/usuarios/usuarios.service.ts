import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  UserCreateInput,
  UserProfile,
  UserUpdateInput,
} from './usuarios.types';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly auth = inject(AuthService);

  async list(): Promise<UserProfile[]> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/list-users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      users?: UserProfile[];
    };
    if (!response.ok || !payload.users) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
    return payload.users;
  }

  async get(id: string): Promise<UserProfile | null> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch(`/api/get-user?id=${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      user?: UserProfile;
    };
    if (response.status === 404) return null;
    if (!response.ok || !payload.user) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
    return payload.user;
  }

  async update(id: string, input: UserUpdateInput): Promise<void> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/update-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: id, full_name: input.full_name }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
  }

  async setAdmin(id: string, isAdmin: boolean): Promise<void> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/update-user-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user_id: id, is_admin: isAdmin }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
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
