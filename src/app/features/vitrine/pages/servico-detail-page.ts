import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, Location } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../../core/auth/auth.service';
import { VitrineService } from '../vitrine.service';
import { ServicoComentarioThread, VitrineServico } from '../vitrine.types';

@Component({
  selector: 'hp-servico-detail-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <header class="detail-header">
      <a class="brand" routerLink="/" aria-label="HP Suporte Remoto">
        <span class="brand-mark">HP</span>
        <span>
          <strong>HP Suporte Remoto</strong>
          <small>Vitrine técnica</small>
        </span>
      </a>

      <nav class="header-actions" aria-label="Ações do site">
        <a mat-button routerLink="/">
          <mat-icon>storefront</mat-icon>
          <span>Vitrine</span>
        </a>
        @if (auth.user(); as user) {
          <a mat-button routerLink="/meus-pedidos">
            <mat-icon>assignment</mat-icon>
            <span>Meus pedidos</span>
          </a>
          <button mat-button type="button" (click)="signOut()">
            <mat-icon>logout</mat-icon>
            <span>Sair</span>
          </button>
          <span class="user-name">{{ user.email }}</span>
        } @else {
          <button mat-flat-button color="primary" type="button" (click)="login()">
            <mat-icon>login</mat-icon>
            <span>Entrar com Google</span>
          </button>
        }
      </nav>
    </header>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="page">
      <button mat-button type="button" class="back-button" (click)="voltar()">
        <mat-icon>arrow_back</mat-icon>
        <span>Voltar</span>
      </button>

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (servico(); as item) {
        <article class="detail-layout">
          <section class="media">
            @if (item.imagem_url) {
              <img [src]="item.imagem_url" [alt]="item.nome" />
            } @else {
              <mat-icon>design_services</mat-icon>
            }
          </section>

          <section class="summary">
            @if (item.categoria; as categoria) {
              <span class="category">{{ categoria.nome }}</span>
            }
            <h1>{{ item.nome }}</h1>
            <strong class="price">{{ item.valor_centavos / 100 | currency }}</strong>
            @if (item.descricao) {
              <p>{{ item.descricao }}</p>
            }
          </section>
        </article>

        <mat-card class="comments-card" appearance="filled">
          <mat-card-content>
            <div class="comments-header">
              <h2>Comentários</h2>
              <button
                mat-button
                type="button"
                (click)="carregarComentarios(item.id)"
                [disabled]="commentsLoading()"
              >
                <mat-icon>refresh</mat-icon>
                <span>Atualizar</span>
              </button>
            </div>

            @if (commentsLoading()) {
              <mat-progress-bar mode="indeterminate" />
            }

            @if (comentarios().length === 0) {
              <p class="no-comments">Ainda não há comentários.</p>
            } @else {
              <div class="comment-list">
                @for (comment of comentarios(); track comment.id) {
                  <article class="comment">
                    <div class="comment-author">
                      @if (comment.author_avatar_url) {
                        <img [src]="comment.author_avatar_url" alt="" loading="lazy" />
                      } @else {
                        <mat-icon>account_circle</mat-icon>
                      }
                      <div>
                        <strong>{{ comment.author_name }}</strong>
                        <time [dateTime]="comment.created_at">
                          {{ comment.created_at | date: 'dd/MM/yyyy HH:mm' }}
                        </time>
                      </div>
                    </div>
                    <p>{{ comment.texto }}</p>
                    <button mat-button type="button" (click)="toggleResponder(comment.id)">
                      <mat-icon>reply</mat-icon>
                      <span>Responder</span>
                    </button>

                    @if (replyingTo() === comment.id) {
                      <form class="reply-form" (ngSubmit)="enviarResposta(item.id, comment.id)">
                        <mat-form-field appearance="outline">
                          <mat-label>Resposta</mat-label>
                          <textarea
                            matInput
                            rows="3"
                            [value]="textFor(replyKey(comment.id))"
                            (input)="setText(replyKey(comment.id), $event)"
                          ></textarea>
                        </mat-form-field>
                        <div class="form-actions">
                          <button mat-button type="button" (click)="toggleResponder(comment.id)">
                            Cancelar
                          </button>
                          <button mat-flat-button color="primary" type="submit">Responder</button>
                        </div>
                      </form>
                    }

                    @if (comment.respostas.length > 0) {
                      <div class="replies">
                        @for (reply of comment.respostas; track reply.id) {
                          <article class="comment reply">
                            <div class="comment-author">
                              @if (reply.author_avatar_url) {
                                <img [src]="reply.author_avatar_url" alt="" loading="lazy" />
                              } @else {
                                <mat-icon>account_circle</mat-icon>
                              }
                              <div>
                                <strong>{{ reply.author_name }}</strong>
                                <time [dateTime]="reply.created_at">
                                  {{ reply.created_at | date: 'dd/MM/yyyy HH:mm' }}
                                </time>
                              </div>
                            </div>
                            <p>{{ reply.texto }}</p>
                          </article>
                        }
                      </div>
                    }
                  </article>
                }
              </div>
            }

            @if (auth.isAuthenticated()) {
              <form class="comment-form" (ngSubmit)="enviarComentario(item.id)">
                <mat-form-field appearance="outline">
                  <mat-label>Comentar</mat-label>
                  <textarea
                    matInput
                    rows="3"
                    [value]="textFor(item.id)"
                    (input)="setText(item.id, $event)"
                  ></textarea>
                </mat-form-field>
                <button mat-flat-button color="primary" type="submit">
                  <mat-icon>send</mat-icon>
                  <span>Comentar</span>
                </button>
              </form>
            } @else {
              <button mat-stroked-button type="button" (click)="login()">
                <mat-icon>login</mat-icon>
                <span>Entrar para comentar</span>
              </button>
            }
          </mat-card-content>
        </mat-card>
      }
    </main>
  `,
  styleUrl: './servico-detail-page.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicoDetailPage {
  protected readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly vitrine = inject(VitrineService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly servico = signal<VitrineServico | null>(null);
  protected readonly comentarios = signal<ServicoComentarioThread[]>([]);
  protected readonly textByKey = signal<Record<string, string>>({});
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly commentsLoading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly title = computed(() => this.servico()?.nome ?? 'Conteúdo');

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('Conteúdo não encontrado');
      return;
    }
    this.loading.set(true);
    try {
      const servico = await this.vitrine.getServico(id);
      if (!servico) {
        this.error.set('Conteúdo não encontrado ou fora da vitrine.');
        return;
      }
      this.servico.set(servico);
      await this.carregarComentarios(servico.id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar conteúdo');
    } finally {
      this.loading.set(false);
    }
  }

  async carregarComentarios(servicoId: string): Promise<void> {
    this.commentsLoading.set(true);
    try {
      this.comentarios.set(await this.vitrine.listComentarios(servicoId));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar comentários';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.commentsLoading.set(false);
    }
  }

  async enviarComentario(servicoId: string): Promise<void> {
    await this.enviarTexto(servicoId, servicoId, null);
  }

  async enviarResposta(servicoId: string, parentId: string): Promise<void> {
    await this.enviarTexto(replyKeyFor(parentId), servicoId, parentId);
  }

  async enviarTexto(key: string, servicoId: string, parentId: string | null): Promise<void> {
    const texto = this.textFor(key).trim();
    if (texto.length < 2) {
      this.snackBar.open('Escreva pelo menos 2 caracteres.', 'OK', { duration: 3000 });
      return;
    }
    try {
      await this.vitrine.comentar({ servicoId, parentId, texto });
      this.setTextValue(key, '');
      this.replyingTo.set(null);
      await this.carregarComentarios(servicoId);
      this.snackBar.open(parentId ? 'Resposta enviada.' : 'Comentário enviado.', 'OK', {
        duration: 2500,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao comentar';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }

  textFor(key: string): string {
    return this.textByKey()[key] ?? '';
  }

  setText(key: string, event: Event): void {
    const input = event.target as HTMLTextAreaElement | null;
    this.setTextValue(key, input?.value ?? '');
  }

  replyKey(commentId: string): string {
    return replyKeyFor(commentId);
  }

  toggleResponder(commentId: string): void {
    if (!this.auth.isAuthenticated()) {
      void this.login();
      return;
    }
    this.replyingTo.update((current) => (current === commentId ? null : commentId));
  }

  voltar(): void {
    this.location.back();
  }

  async login(): Promise<void> {
    const id = this.servico()?.id ?? this.route.snapshot.paramMap.get('id') ?? '';
    await this.auth.signInWithGoogle(id ? `/servicos/${id}` : '/');
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }

  private setTextValue(key: string, value: string): void {
    this.textByKey.update((state) => ({ ...state, [key]: value }));
  }
}

function replyKeyFor(commentId: string): string {
  return `reply:${commentId}`;
}
