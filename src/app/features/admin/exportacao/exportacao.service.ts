import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class AdminExportacaoService {
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);

  async exportarTudoExcel(): Promise<void> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Sessão inválida');

    const response = await fetch('/api/export-excel', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }

    const blob = await response.blob();
    const filename = resolveFilename(response.headers.get('content-disposition'));
    this.downloadBlob(blob, filename);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const urlApi = this.document.defaultView?.URL;
    if (!urlApi) throw new Error('Download indisponível neste ambiente');

    const url = urlApi.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    this.document.body.append(anchor);
    anchor.click();
    anchor.remove();
    urlApi.revokeObjectURL(url);
  }
}

function resolveFilename(contentDisposition: string | null): string {
  const fallback = `hp-suporte-remoto-${new Date().toISOString().slice(0, 10)}.xlsx`;
  if (!contentDisposition) return fallback;

  const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].trim());

  const asciiMatch = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return asciiMatch?.[1]?.trim() || fallback;
}
