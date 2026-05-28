import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../../core/auth/auth.service';
import { VitrineService } from '../vitrine.service';
import { VitrineServico } from '../vitrine.types';

const SEM_CATEGORIA_ID = '__sem_categoria__';
type OrdenacaoCatalogo = 'relevancia' | 'recentes';

@Component({
  selector: 'hp-vitrine-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
  ],
  template: `
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="HP Softwares">
        <span class="brand-mark">HP</span>
        <span>
          <strong>HP Softwares</strong>
          <small>Catálogo técnico</small>
        </span>
      </a>

      <nav class="header-actions" aria-label="Navegação do catálogo">
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
      <section class="store-hero" aria-labelledby="vitrine-title">
        <div class="hero-copy">
          <p class="eyebrow">Catálogo</p>
          <h1 id="vitrine-title">Softwares e conteúdo técnico</h1>
          <p>
            Produtos organizados por categoria, com imagem, descrição e detalhes.
          </p>
        </div>

        <div class="hero-summary" aria-label="Resumo do catálogo">
          <span>{{ totalItens() }} item(ns)</span>
          <strong>Conteúdo organizado</strong>
        </div>
      </section>

      <section class="catalog-toolbar" aria-label="Ferramentas do catálogo">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>Buscar no catálogo</mat-label>
          <mat-icon matPrefix>search</mat-icon>
          <input
            matInput
            type="search"
            placeholder="Ex.: AutoCAD, Corel, treinamento"
            [value]="termoBusca()"
            (input)="onBuscaChange($event)"
            autocomplete="off"
          />
          @if (termoBusca()) {
            <button
              mat-icon-button
              matSuffix
              type="button"
              (click)="limparBusca()"
              aria-label="Limpar busca"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="sort-field">
          <mat-label>Ordenar</mat-label>
          <mat-select [value]="ordenacao()" (selectionChange)="selecionarOrdenacao($event.value)">
            <mat-option value="relevancia">Relevância</mat-option>
            <mat-option value="recentes">Mais recentes</mat-option>
          </mat-select>
        </mat-form-field>
      </section>

      @if (categorias().length > 0 || hasSemCategoria()) {
        <nav class="category-menu" aria-label="Categorias do catálogo">
          <button
            type="button"
            [class.active]="categoriaSelecionada() === null"
            [attr.aria-pressed]="categoriaSelecionada() === null"
            (click)="selecionarCategoria(null)"
          >
            Todos
            <span>{{ servicos().length }}</span>
          </button>
          @for (categoria of categorias(); track categoria.id) {
            <button
              type="button"
              [class.active]="categoriaSelecionada() === categoria.id"
              [attr.aria-pressed]="categoriaSelecionada() === categoria.id"
              (click)="selecionarCategoria(categoria.id)"
            >
              {{ categoria.nome }}
              <span>{{ categoria.quantidade }}</span>
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
              <span>{{ semCategoriaCount() }}</span>
            </button>
          }
        </nav>
      }

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (!loading() && servicosFiltrados().length === 0) {
        <section class="empty" aria-label="Nenhum item no catálogo">
          <mat-icon>inventory_2</mat-icon>
          <strong>{{ emptyMessage() }}</strong>
        </section>
      }

      <div class="catalog-meta" aria-live="polite">
        <span>{{ servicosFiltrados().length }} resultado(s)</span>
        @if (categoriaAtualLabel(); as categoria) {
          <strong>{{ categoria }}</strong>
        }
      </div>

      <section class="product-grid" aria-label="Itens do catálogo">
        @for (servico of servicosFiltrados(); track servico.id) {
          <mat-card class="product-card" appearance="outlined">
            <a
              class="media"
              [routerLink]="['/servicos', servico.id]"
              [attr.aria-label]="servico.nome"
            >
              @if (servico.imagem_url) {
                <img [src]="servico.imagem_url" [alt]="servico.nome" loading="lazy" />
              } @else {
                <mat-icon>design_services</mat-icon>
              }
            </a>

            <mat-card-content class="product-content">
              <div class="product-tags">
                @if (servico.categoria; as categoria) {
                  <span class="category">{{ categoria.nome }}</span>
                }
                <span class="availability">No catálogo</span>
              </div>

              <h2>
                <a [routerLink]="['/servicos', servico.id]">{{ servico.nome }}</a>
              </h2>

              @if (servico.descricao) {
                <p class="description">{{ servico.descricao }}</p>
              }

              <div class="product-actions">
                <a mat-flat-button color="primary" [routerLink]="['/servicos', servico.id]">
                  <mat-icon>open_in_new</mat-icon>
                  <span>Ver produto</span>
                </a>
              </div>
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
  protected readonly termoBusca = signal('');
  protected readonly ordenacao = signal<OrdenacaoCatalogo>('relevancia');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly totalItens = computed(() => this.servicos().length);
  protected readonly categorias = computed(() => {
    const byId = new Map<string, { id: string; nome: string; quantidade: number }>();
    for (const servico of this.servicos()) {
      if (!servico.categoria) continue;
      const atual = byId.get(servico.categoria.id);
      byId.set(servico.categoria.id, {
        id: servico.categoria.id,
        nome: servico.categoria.nome,
        quantidade: (atual?.quantidade ?? 0) + 1,
      });
    }
    return [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });
  protected readonly hasSemCategoria = computed(() =>
    this.servicos().some((servico) => !servico.categoria),
  );
  protected readonly semCategoriaCount = computed(
    () => this.servicos().filter((servico) => !servico.categoria).length,
  );
  protected readonly categoriaAtualLabel = computed(() => {
    const categoriaId = this.categoriaSelecionada();
    if (!categoriaId) return 'Todos';
    if (categoriaId === SEM_CATEGORIA_ID) return 'Sem categoria';
    return this.categorias().find((categoria) => categoria.id === categoriaId)?.nome ?? null;
  });
  protected readonly servicosFiltrados = computed(() => {
    const categoriaId = this.categoriaSelecionada();
    const termo = normalizarBusca(this.termoBusca());
    const filtered = this.servicos().filter((servico) => {
      const matchesCategoria =
        !categoriaId ||
        (categoriaId === SEM_CATEGORIA_ID
          ? !servico.categoria
          : servico.categoria?.id === categoriaId);
      if (!matchesCategoria) return false;
      if (!termo) return true;
      return textoBuscaServico(servico).includes(termo);
    });
    return ordenarServicos(filtered, this.ordenacao());
  });
  protected readonly emptyMessage = computed(() => {
    if (this.termoBusca()) return 'Nada encontrado para esta busca';
    return this.servicos().length === 0
      ? 'Nenhum item disponível no momento'
      : 'Nenhum item nesta categoria';
  });

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
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar catálogo');
    } finally {
      this.loading.set(false);
    }
  }

  selecionarCategoria(categoriaId: string | null): void {
    this.categoriaSelecionada.set(categoriaId);
  }

  onBuscaChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.termoBusca.set(input?.value ?? '');
  }

  limparBusca(): void {
    this.termoBusca.set('');
  }

  selecionarOrdenacao(value: unknown): void {
    if (isOrdenacaoCatalogo(value)) this.ordenacao.set(value);
  }

  async login(): Promise<void> {
    await this.auth.signInWithGoogle('/');
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
  }
}

function ordenarServicos(
  servicos: readonly VitrineServico[],
  ordenacao: OrdenacaoCatalogo,
): VitrineServico[] {
  const list = [...servicos];
  switch (ordenacao) {
    case 'recentes':
      return list.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    case 'relevancia':
      return list;
  }
}

function isOrdenacaoCatalogo(value: unknown): value is OrdenacaoCatalogo {
  return value === 'relevancia' || value === 'recentes';
}

function textoBuscaServico(servico: VitrineServico): string {
  return normalizarBusca(
    [servico.nome, servico.descricao, servico.categoria?.nome].filter(Boolean).join(' '),
  );
}

function normalizarBusca(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
