import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { normalizeServiceImageUrl } from '../../shared/image-url.util';
import {
  MeuPedido,
  ServicoComentario,
  ServicoComentarioThread,
  VitrineServico,
} from './vitrine.types';

@Injectable({ providedIn: 'root' })
export class VitrineService {
  private readonly auth = inject(AuthService);

  async listServicos(): Promise<VitrineServico[]> {
    const response = await fetch('/api/storefront-services');
    const payload = (await response.json().catch(() => ({}))) as {
      servicos?: VitrineServico[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return (payload.servicos ?? []).map((servico) => ({
      ...servico,
      imagem_url: normalizeServiceImageUrl(servico.imagem_url),
      vitrine: servico.vitrine !== false,
    }));
  }

  async getServico(id: string): Promise<VitrineServico | null> {
    const servicos = await this.listServicos();
    return servicos.find((servico) => servico.id === id) ?? null;
  }

  async listMeusPedidos(): Promise<MeuPedido[]> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Entre com Google para ver seus pedidos.');
    const response = await fetch('/api/my-atendimentos', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await response.json().catch(() => ({}))) as {
      atendimentos?: MeuPedido[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return payload.atendimentos ?? [];
  }

  async listComentarios(servicoId: string): Promise<ServicoComentarioThread[]> {
    const response = await fetch(
      `/api/service-comments?servicoId=${encodeURIComponent(servicoId)}`,
    );
    const payload = (await response.json().catch(() => ({}))) as {
      comentarios?: ServicoComentario[];
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? `Erro ${response.status}`);
    return toThreads(payload.comentarios ?? []);
  }

  async comentar(input: {
    servicoId: string;
    texto: string;
    parentId?: string | null;
  }): Promise<ServicoComentario> {
    const token = await this.auth.getAccessToken();
    if (!token) throw new Error('Entre com Google para comentar.');
    const response = await fetch('/api/service-comments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        servico_id: input.servicoId,
        parent_id: input.parentId ?? null,
        texto: input.texto,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      comentario?: ServicoComentario;
      error?: string;
    };
    if (!response.ok || !payload.comentario) {
      throw new Error(payload.error ?? `Erro ${response.status}`);
    }
    return payload.comentario;
  }
}

function toThreads(comentarios: ServicoComentario[]): ServicoComentarioThread[] {
  const roots = comentarios.filter((comentario) => comentario.parent_id === null);
  const repliesByParent = new Map<string, ServicoComentario[]>();
  for (const comentario of comentarios) {
    if (!comentario.parent_id) continue;
    const replies = repliesByParent.get(comentario.parent_id) ?? [];
    replies.push(comentario);
    repliesByParent.set(comentario.parent_id, replies);
  }
  return roots.map((comentario) => ({
    ...comentario,
    respostas: repliesByParent.get(comentario.id) ?? [],
  }));
}
