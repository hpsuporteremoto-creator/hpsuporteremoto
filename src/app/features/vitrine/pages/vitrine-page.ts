import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../../core/auth/auth.service';
import { VitrineService } from '../vitrine.service';
import { VitrineServico } from '../vitrine.types';

const SEM_CATEGORIA_ID = '__sem_categoria__';

@Component({
  selector: 'hp-vitrine-page',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="HP Suporte Remoto">
        <span class="brand-mark">HP</span>
        <span>
          <strong>HP Suporte Remoto</strong>
          <small>Tecnologia e suporte</small>
        </span>
      </a>

      <nav class="header-actions" aria-label="Ações do site">
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
      <section class="intro" aria-labelledby="vitrine-title">
        <p>Atendimento remoto, manutenção e suporte técnico</p>
        <h1 id="vitrine-title">Conteúdos técnicos</h1>
      </section>

      @if (categorias().length > 0 || hasSemCategoria()) {
        <nav class="category-menu" aria-label="Categorias da vitrine">
          <button
            type="button"
            [class.active]="categoriaSelecionada() === null"
            [attr.aria-pressed]="categoriaSelecionada() === null"
            (click)="selecionarCategoria(null)"
          >
            Todos
          </button>
          @for (categoria of categorias(); track categoria.id) {
            <button
              type="button"
              [class.active]="categoriaSelecionada() === categoria.id"
              [attr.aria-pressed]="categoriaSelecionada() === categoria.id"
              (click)="selecionarCategoria(categoria.id)"
            >
              {{ categoria.nome }}
            </button>
          }
          @if (hasSemCategoria()) {
            <button
              type="button"
              [class.active]="categoriaSelecionada() === semCategoriaId"
              [attr.aria-pressed]="categoriaSelecionada() === semCategoriaId"
              (click)="selecionarCategoria(semCategoriaId)"
            >
              Sem categoria
            </button>
          }
        </nav>
      }

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (!loading() && servicosFiltrados().length === 0) {
        <section class="empty" aria-label="Nenhum conteúdo na vitrine">
          <mat-icon>inventory_2</mat-icon>
          <strong>{{ emptyMessage() }}</strong>
        </section>
      }

      <section class="service-grid" aria-label="Conteúdos disponíveis">
        @for (servico of servicosFiltrados(); track servico.id) {
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
                <h2>
                  <a [routerLink]="['/servicos', servico.id]">{{ servico.nome }}</a>
                </h2>
                <strong class="price">
                  {{ servico.valor_centavos / 100 | currency }}
                </strong>
              </div>

              @if (servico.descricao) {
                <p class="description">{{ servico.descricao }}</p>
              }

              <a mat-stroked-button [routerLink]="['/servicos', servico.id]">
                <mat-icon>article</mat-icon>
                <span>Ver detalhes</span>
              </a>
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

  protected readonly semCategoriaId = SEM_CATEGORIA_ID;
  protected readonly servicos = signal<VitrineServico[]>([]);
  protected readonly categoriaSelecionada = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly categorias = computed(() => {
    const byId = new Map<string, { id: string; nome: string }>();
    for (const servico of this.servicos()) {
      if (!servico.categoria) continue;
      byId.set(servico.categoria.id, {
        id: servico.categoria.id,
        nome: servico.categoria.nome,
      });
    }
    return [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });
  protected readonly hasSemCategoria = computed(() =>
    this.servicos().some((servico) => !servico.categoria),
  );
  protected readonly servicosFiltrados = computed(() => {
    const categoriaId = this.categoriaSelecionada();
    if (!categoriaId) return this.servicos();
    if (categoriaId === SEM_CATEGORIA_ID) {
      return this.servicos().filter((servico) => !servico.categoria);
    }
    return this.servicos().filter((servico) => servico.categoria?.id === categoriaId);
  });
  protected readonly emptyMessage = computed(() =>
    this.servicos().length === 0
      ? 'Nenhum conteúdo disponível no momento'
      : 'Nenhum conteúdo nesta categoria',
  );

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const servicos = await this.vitrine.listServicos();
      this.servicos.set(servicos);
      const categoriaSelecionada = this.categoriaSelecionada();
      const categoriaValida =
        !categoriaSelecionada ||
        (categoriaSelecionada === SEM_CATEGORIA_ID
          ? servicos.some((servico) => !servico.categoria)
          : servicos.some((servico) => servico.categoria?.id === categoriaSelecionada));
      if (!categoriaValida) {
        this.categoriaSelecionada.set(null);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar vitrine');
    } finally {
      this.loading.set(false);
    }
  }

  selecionarCategoria(categoriaId: string | null): void {
    this.categoriaSelecionada.set(categoriaId);
  }

  async login(): Promise<void> {
    await this.auth.signInWithGoogle('/');
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}
