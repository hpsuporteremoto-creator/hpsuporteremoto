import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
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
  selector: 'hp-vitrine-page',
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
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="HP Suporte Remoto">
        <span class="brand-mark">HP</span>
        <span>
          <strong>HP Suporte Remoto</strong>
          <small>Serviços de tecnologia</small>
        </span>
      </a>

      <nav class="header-actions" aria-label="Ações do site">
        @if (auth.user(); as user) {
          @if (auth.isStaff()) {
            <a mat-stroked-button routerLink="/admin">
              <mat-icon>admin_panel_settings</mat-icon>
              <span>Admin</span>
            </a>
          }
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
      <section class="intro" aria-labelledby="vitrine-title">
        <p>Atendimento remoto, manutenção e suporte técnico</p>
        <h1 id="vitrine-title">Escolha um serviço</h1>
      </section>

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (!loading() && servicos().length === 0) {
        <section class="empty" aria-label="Nenhum serviço na vitrine">
          <mat-icon>inventory_2</mat-icon>
          <strong>Nenhum serviço disponível no momento</strong>
        </section>
      }

      <section class="service-grid" aria-label="Serviços disponíveis">
        @for (servico of servicos(); track servico.id) {
          <mat-card class="service-card" appearance="filled">
            <div class="media">
              @if (servico.imagem_url) {
                <img [src]="servico.imagem_url" [alt]="servico.nome" loading="lazy" />
              } @else {
                <mat-icon>design_services</mat-icon>
              }
            </div>

            <mat-card-content class="service-content">
              <div class="service-heading">
                @if (servico.categoria; as categoria) {
                  <span class="category">{{ categoria.nome }}</span>
                }
                <h2>{{ servico.nome }}</h2>
                <strong class="price">
                  {{ servico.valor_centavos / 100 | currency }}
                </strong>
              </div>

              @if (servico.descricao) {
                <p class="description">{{ servico.descricao }}</p>
              }

              <section class="comments" [attr.aria-label]="'Comentários de ' + servico.nome">
                <div class="comments-header">
                  <h3>Comentários</h3>
                  <button
                    mat-button
                    type="button"
                    (click)="carregarComentarios(servico.id)"
                    [disabled]="comentariosLoading()[servico.id] === true"
                  >
                    <mat-icon>refresh</mat-icon>
                    <span>Atualizar</span>
                  </button>
                </div>

                @if (comentariosLoading()[servico.id]) {
                  <mat-progress-bar mode="indeterminate" />
                }

                @if (commentsFor(servico.id).length === 0) {
                  <p class="no-comments">Ainda não há comentários.</p>
                } @else {
                  <div class="comment-list">
                    @for (comment of commentsFor(servico.id); track comment.id) {
                      <article class="comment">
                        <div class="comment-author">
                          @if (comment.author_avatar_url) {
                            <img
                              [src]="comment.author_avatar_url"
                              alt=""
                              loading="lazy"
                            />
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
                        <button
                          mat-button
                          type="button"
                          (click)="toggleResponder(comment.id)"
                        >
                          <mat-icon>reply</mat-icon>
                          <span>Responder</span>
                        </button>

                        @if (replyingTo() === comment.id) {
                          <form class="reply-form" (ngSubmit)="enviarResposta(servico, comment.id)">
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
                              <button mat-flat-button color="primary" type="submit">
                                Responder
                              </button>
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
                  <form class="comment-form" (ngSubmit)="enviarComentario(servico)">
                    <mat-form-field appearance="outline">
                      <mat-label>Comentar este serviço</mat-label>
                      <textarea
                        matInput
                        rows="3"
                        [value]="textFor(servico.id)"
                        (input)="setText(servico.id, $event)"
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
              </section>
            </mat-card-content>
          </mat-card>
        }
      </section>
    </main>
  `,
  styleUrl: './vitrine-page.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VitrinePage {
  protected readonly auth = inject(AuthService);
  private readonly vitrine = inject(VitrineService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly servicos = signal<VitrineServico[]>([]);
  protected readonly commentsByService = signal<Record<string, ServicoComentarioThread[]>>({});
  protected readonly comentariosLoading = signal<Record<string, boolean>>({});
  protected readonly textByKey = signal<Record<string, string>>({});
  protected readonly replyingTo = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly hasServices = computed(() => this.servicos().length > 0);

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const servicos = await this.vitrine.listServicos();
      this.servicos.set(servicos);
      await Promise.all(servicos.map((servico) => this.carregarComentarios(servico.id)));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar vitrine');
    } finally {
      this.loading.set(false);
    }
  }

  async carregarComentarios(servicoId: string): Promise<void> {
    this.comentariosLoading.update((state) => ({ ...state, [servicoId]: true }));
    try {
      const comentarios = await this.vitrine.listComentarios(servicoId);
      this.commentsByService.update((state) => ({ ...state, [servicoId]: comentarios }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar comentários';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.comentariosLoading.update((state) => ({ ...state, [servicoId]: false }));
    }
  }

  async enviarComentario(servico: VitrineServico): Promise<void> {
    await this.enviarTexto(servico.id, servico.id, null);
  }

  async enviarResposta(servico: VitrineServico, parentId: string): Promise<void> {
    await this.enviarTexto(replyKeyFor(parentId), servico.id, parentId);
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

  commentsFor(servicoId: string): ServicoComentarioThread[] {
    return this.commentsByService()[servicoId] ?? [];
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

  async login(): Promise<void> {
    await this.auth.signInWithGoogle('/');
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
