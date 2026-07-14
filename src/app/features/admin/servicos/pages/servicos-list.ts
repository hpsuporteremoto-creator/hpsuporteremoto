import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ServicoCategoriasService, ServicosService } from '../servicos.service';
import { Servico, ServicoCategoria } from '../servicos.types';
import {
  destacarBuscaServico,
  type SearchHighlightSegment,
} from '../../../../shared/service-search.util';

const SEM_CATEGORIA_ID = '__sem_categoria__';

@Component({
  selector: 'hp-servicos-list',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Serviços</span>
      <span class="spacer"></span>
      <a mat-stroked-button routerLink="categorias" aria-label="Gerenciar categorias">
        <mat-icon>category</mat-icon>
        <span>Gerenciar categorias</span>
      </a>
      <a mat-flat-button color="primary" routerLink="novo" aria-label="Novo serviço">
        <mat-icon>add</mat-icon>
        <span>Novo serviço</span>
      </a>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <mat-tab-group
      [selectedIndex]="tabIndex()"
      (selectedIndexChange)="onTabChange($event)"
      mat-stretch-tabs="false"
      animationDuration="0ms"
    >
      <mat-tab [label]="'Ativos (' + activeTotal() + ')'" />
      <mat-tab [label]="'Inativos (' + inactiveTotal() + ')'" />
    </mat-tab-group>

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (servicos()) {
        <section class="search-area" aria-label="Busca de serviços">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Buscar serviços</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              type="search"
              placeholder="Ex.: AutoCAD, treinamento, limpeza"
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
          <p class="result-count" aria-live="polite">
            {{ totalServicos() }} serviço(s) encontrado(s)
          </p>
        </section>
      }

      @if (categorias().length > 0 || servicos()) {
        <nav class="category-filter" aria-label="Filtrar serviços por categoria">
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
          <button
            type="button"
            [class.active]="categoriaSelecionada() === semCategoriaId"
            [attr.aria-pressed]="categoriaSelecionada() === semCategoriaId"
            (click)="selecionarCategoria(semCategoriaId)"
          >
            Sem categoria
          </button>
        </nav>
      }

      @if (servicos(); as list) {
        @if (list.length === 0) {
          <p class="empty">{{ emptyMessage() }}</p>
        } @else {
          <div class="list">
            @for (servico of list; track servico.id) {
              <mat-card class="servico-card" appearance="filled" [class.inativo]="!servico.ativo">
                <mat-card-content class="row">
                  <div class="thumb" aria-hidden="true">
                    @if (servico.imagem_url) {
                      <img [src]="servico.imagem_url" alt="" loading="lazy" />
                    } @else {
                      <mat-icon>design_services</mat-icon>
                    }
                  </div>
                  <div class="info">
                    <strong class="nome">
                      @for (part of highlightServicoTexto(servico.nome); track $index) {
                        @if (part.highlighted) {
                          <mark class="search-highlight">{{ part.text }}</mark>
                        } @else {
                          {{ part.text }}
                        }
                      }
                    </strong>
                    @if (servico.categoria; as categoria) {
                      <small class="categoria">
                        @for (part of highlightServicoTexto(categoria.nome); track $index) {
                          @if (part.highlighted) {
                            <mark class="search-highlight">{{ part.text }}</mark>
                          } @else {
                            {{ part.text }}
                          }
                        }
                      </small>
                    }
                    @if (servico.vitrine) {
                      <small class="vitrine">No site</small>
                    }
                    @if (servico.descricao) {
                      <span class="descricao">
                        @for (part of highlightServicoTexto(servico.descricao); track $index) {
                          @if (part.highlighted) {
                            <mark class="search-highlight">{{ part.text }}</mark>
                          } @else {
                            {{ part.text }}
                          }
                        }
                      </span>
                    }
                    <span class="valor">{{ servico.valor_centavos / 100 | currency }}</span>
                  </div>
                  <div class="actions">
                    <mat-slide-toggle
                      [checked]="servico.ativo"
                      (change)="onToggle(servico, $event.checked)"
                      aria-label="Ativo"
                    />
                    <a mat-icon-button [routerLink]="[servico.id, 'editar']" aria-label="Editar">
                      <mat-icon>edit</mat-icon>
                    </a>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>

          @if (totalServicos() > pageSize()) {
            <mat-paginator
              [length]="totalServicos()"
              [pageIndex]="pageIndex()"
              [pageSize]="pageSize()"
              [pageSizeOptions]="[10, 20, 50]"
              [showFirstLastButtons]="true"
              (page)="onPage($event)"
              aria-label="Paginação de serviços"
            />
          }
        }
      }
    </main>
  `,
  styleUrl: './servicos-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicosListPage {
  private readonly svc = inject(ServicosService);
  private readonly categoriasSvc = inject(ServicoCategoriasService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private buscaTimer: ReturnType<typeof setTimeout> | null = null;
  private requestVersion = 0;

  protected readonly semCategoriaId = SEM_CATEGORIA_ID;
  protected readonly servicos = signal<Servico[] | null>(null);
  protected readonly categoriaSelecionada = signal<string | null>(null);
  protected readonly termoBusca = signal('');
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly totalServicos = signal(0);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tabIndex = signal(0);
  protected readonly activeTotal = signal(0);
  protected readonly inactiveTotal = signal(0);
  protected readonly categorias = signal<ServicoCategoria[]>([]);
  protected readonly emptyMessage = computed(() => {
    if (this.termoBusca() && this.categoriaSelecionada()) {
      return 'Nenhum serviço encontrado nesta categoria.';
    }
    if (this.termoBusca()) return 'Nenhum serviço encontrado para esta busca.';
    if (this.categoriaSelecionada()) return 'Nenhum serviço nesta categoria.';
    return this.tabIndex() === 0
      ? 'Nenhum serviço ativo cadastrado.'
      : 'Nenhum serviço inativo cadastrado.';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.cancelarBuscaPendente());
    void this.carregar();
    void this.carregarCategorias();
  }

  voltar(): void {
    this.location.back();
  }

  onTabChange(index: number): void {
    this.tabIndex.set(index);
    this.pageIndex.set(0);
    void this.carregar();
  }

  selecionarCategoria(categoriaId: string | null): void {
    this.categoriaSelecionada.set(categoriaId);
    this.pageIndex.set(0);
    void this.carregar();
  }

  onBuscaChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.termoBusca.set(input?.value ?? '');
    this.pageIndex.set(0);
    this.cancelarBuscaPendente();
    this.buscaTimer = setTimeout(() => {
      this.buscaTimer = null;
      void this.carregar();
    }, 250);
  }

  limparBusca(): void {
    this.termoBusca.set('');
    this.pageIndex.set(0);
    this.cancelarBuscaPendente();
    void this.carregar();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    void this.carregar();
  }

  highlightServicoTexto(value: string): readonly SearchHighlightSegment[] {
    return destacarBuscaServico(value, this.termoBusca());
  }

  async carregar(): Promise<void> {
    const requestVersion = ++this.requestVersion;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.svc.listPage({
        ativo: this.tabIndex() === 0,
        pageIndex: this.pageIndex(),
        pageSize: this.pageSize(),
        termo: this.termoBusca(),
        categoriaId: this.categoriaSelecionada(),
      });
      if (requestVersion !== this.requestVersion) return;
      this.activeTotal.set(result.counts.ativos);
      this.inactiveTotal.set(result.counts.inativos);
      this.totalServicos.set(result.total);
      this.servicos.set(result.servicos);
    } catch (err) {
      if (requestVersion !== this.requestVersion) return;
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar serviços');
    } finally {
      if (requestVersion === this.requestVersion) this.loading.set(false);
    }
  }

  async onToggle(servico: Servico, ativo: boolean): Promise<void> {
    try {
      await this.svc.toggleAtivo(servico.id, ativo);
      this.pageIndex.set(0);
      await this.carregar();
      this.snackBar.open(`Serviço ${ativo ? 'ativado' : 'desativado'}`, 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }

  private async carregarCategorias(): Promise<void> {
    try {
      this.categorias.set(await this.categoriasSvc.list());
    } catch {
      this.categorias.set([]);
    }
  }

  private cancelarBuscaPendente(): void {
    if (this.buscaTimer === null) return;
    clearTimeout(this.buscaTimer);
    this.buscaTimer = null;
  }
}
