import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { AdminDashboardData } from './dashboard.types';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly auth = inject(AuthService);

  async load(): Promise<AdminDashboardData> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');
    const response = await fetch('/api/dashboard', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as AdminDashboardData & {
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload;
  }
}
