import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ServicosService } from '../servicos.service';
import { Servico } from '../servicos.types';

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
            {{ servicosFiltrados()?.length ?? 0 }} serviço(s) encontrado(s)
          </p>
        </section>
      }

      @if (categorias().length > 0 || hasSemCategoria()) {
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

      @if (servicosFiltrados(); as list) {
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
                    <strong class="nome">{{ servico.nome }}</strong>
                    @if (servico.categoria; as categoria) {
                      <small class="categoria">{{ categoria.nome }}</small>
                    }
                    @if (servico.vitrine) {
                      <small class="vitrine">No site</small>
                    }
                    @if (servico.descricao) {
                      <span class="descricao">{{ servico.descricao }}</span>
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
        }
      }
    </main>
  `,
  styleUrl: './servicos-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicosListPage {
  private readonly svc = inject(ServicosService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(Location);

  protected readonly semCategoriaId = SEM_CATEGORIA_ID;
  protected readonly servicos = signal<Servico[] | null>(null);
  protected readonly categoriaSelecionada = signal<string | null>(null);
  protected readonly termoBusca = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tabIndex = signal(0);
  protected readonly activeTotal = signal(0);
  protected readonly inactiveTotal = signal(0);
  protected readonly categorias = computed(() => {
    const byId = new Map<string, { id: string; nome: string }>();
    for (const servico of this.servicos() ?? []) {
      if (!servico.categoria) continue;
      byId.set(servico.categoria.id, {
        id: servico.categoria.id,
        nome: servico.categoria.nome,
      });
    }
    return [...byId.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  });
  protected readonly hasSemCategoria = computed(() =>
    (this.servicos() ?? []).some((servico) => !servico.categoria),
  );
  protected readonly servicosFiltrados = computed(() => {
    const list = this.servicos();
    if (!list) return null;
    const categoriaId = this.categoriaSelecionada();
    const termo = normalizarBusca(this.termoBusca());
    return list.filter((servico) => {
      const matchesCategoria =
        !categoriaId ||
        (categoriaId === SEM_CATEGORIA_ID
          ? !servico.categoria
          : servico.categoria?.id === categoriaId);
      if (!matchesCategoria) return false;
      if (!termo) return true;
      return textoBuscaServico(servico).includes(termo);
    });
  });
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
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  onTabChange(index: number): void {
    this.tabIndex.set(index);
    void this.carregar();
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

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [counts, data] = await Promise.all([
        this.svc.counts(),
        this.svc.listByAtivo(this.tabIndex() === 0),
      ]);
      this.activeTotal.set(counts.ativos);
      this.inactiveTotal.set(counts.inativos);
      this.servicos.set(data);
      this.ensureCategoriaValida(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar serviços');
    } finally {
      this.loading.set(false);
    }
  }

  async onToggle(servico: Servico, ativo: boolean): Promise<void> {
    try {
      await this.svc.toggleAtivo(servico.id, ativo);
      await this.carregar();
      this.snackBar.open(`Serviço ${ativo ? 'ativado' : 'desativado'}`, 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }

  private ensureCategoriaValida(servicos: readonly Servico[]): void {
    const categoriaId = this.categoriaSelecionada();
    if (!categoriaId) return;
    const hasCategoria =
      categoriaId === SEM_CATEGORIA_ID
        ? servicos.some((servico) => !servico.categoria)
        : servicos.some((servico) => servico.categoria?.id === categoriaId);
    if (!hasCategoria) this.categoriaSelecionada.set(null);
  }
}

function textoBuscaServico(servico: Servico): string {
  return normalizarBusca(
    [
      servico.nome,
      servico.descricao,
      servico.categoria?.nome,
      servico.vitrine ? 'vitrine' : '',
      String(servico.valor_centavos / 100),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function normalizarBusca(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
