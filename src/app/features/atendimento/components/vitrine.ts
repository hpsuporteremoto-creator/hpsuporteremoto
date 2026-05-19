import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ServicosService } from '../../admin/servicos/servicos.service';
import { Servico } from '../../admin/servicos/servicos.types';

const SEM_CATEGORIA = 'Outros';

@Component({
  selector: 'hp-vitrine',
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="vitrine">
      <header>
        <mat-icon class="storefront">storefront</mat-icon>
        <h1>O que você precisa?</h1>
        <p class="hint">Escolha o serviço que melhor descreve sua necessidade pra começar.</p>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (servicos().length === 0 && servicosLoaded()) {
        <p class="empty">Nenhum serviço disponível no momento.</p>
      } @else if (servicos().length > 0) {
        <mat-form-field appearance="outline" class="search">
          <mat-icon matIconPrefix>search</mat-icon>
          <input
            matInput
            placeholder="Buscar serviço…"
            [value]="search()"
            (input)="onSearchInput($event)"
          />
          @if (search()) {
            <button
              matIconSuffix
              mat-icon-button
              type="button"
              (click)="search.set('')"
              aria-label="Limpar busca"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>

        @if (categorias().length > 1) {
          <mat-chip-listbox
            [multiple]="false"
            (change)="onCategoriaChange($event)"
            hideSingleSelectionIndicator
            aria-label="Filtrar por categoria"
          >
            <mat-chip-option [selected]="categoriaFiltro() === null" [value]="''">
              Todos
            </mat-chip-option>
            @for (cat of categorias(); track cat) {
              <mat-chip-option [selected]="categoriaFiltro() === cat" [value]="cat">{{
                cat
              }}</mat-chip-option>
            }
          </mat-chip-listbox>
        }

        @if (servicosAgrupados().length === 0) {
          <p class="empty">Nenhum serviço encontrado.</p>
        } @else {
          <div class="grupos">
            @for (grupo of servicosAgrupados(); track grupo.categoria) {
              <div class="grupo">
                <h3 class="grupo-titulo">{{ grupo.categoria }}</h3>
                <div class="grupo-cards">
                  @for (s of grupo.servicos; track s.id) {
                    <mat-card
                      class="servico-option"
                      appearance="filled"
                      [class.selected]="isSelected(s.id)"
                      [attr.aria-pressed]="isSelected(s.id)"
                      (click)="toggleServico(s.id)"
                      tabindex="0"
                      (keydown.enter)="toggleServico(s.id)"
                      (keydown.space)="toggleServico(s.id); $event.preventDefault()"
                      role="button"
                    >
                      <mat-card-content class="servico-option-content">
                        <mat-icon class="selection-icon">
                          {{ isSelected(s.id) ? 'check_circle' : 'add_circle' }}
                        </mat-icon>
                        <strong class="servico-nome">{{ s.nome }}</strong>
                        <span class="servico-valor">
                          {{ s.valor_centavos / 100 | currency }}
                        </span>
                      </mat-card-content>
                    </mat-card>
                  }
                </div>
              </div>
            }
          </div>
        }

        <div class="selection-bar" aria-live="polite">
          <div>
            <strong>{{ selectedCount() }}</strong>
            <span>
              {{ selectedCount() === 1 ? 'serviço selecionado' : 'serviços selecionados' }}
            </span>
            @if (selectedTotal() > 0) {
              <small>{{ selectedTotal() / 100 | currency }}</small>
            }
          </div>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="selectedCount() === 0"
            (click)="continuar()"
          >
            <mat-icon>arrow_forward</mat-icon>
            <span>Continuar</span>
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './vitrine.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Vitrine {
  private readonly servicosSvc = inject(ServicosService);

  readonly selected = output<Servico[]>();

  protected readonly servicos = signal<Servico[]>([]);
  protected readonly servicosLoaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly search = signal('');
  protected readonly categoriaFiltro = signal<string | null>(null);
  protected readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  protected readonly selectedCount = computed(() => this.selectedIds().size);
  protected readonly selectedTotal = computed(() =>
    this.servicos()
      .filter((servico) => this.selectedIds().has(servico.id))
      .reduce((total, servico) => total + servico.valor_centavos, 0),
  );
  protected readonly categorias = computed(() => {
    const set = new Set<string>();
    for (const s of this.servicos()) {
      set.add(s.categoria?.trim() || SEM_CATEGORIA);
    }
    return Array.from(set).sort((a, b) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b, 'pt-BR');
    });
  });

  protected readonly servicosAgrupados = computed<
    ReadonlyArray<{ categoria: string; servicos: ReadonlyArray<Servico> }>
  >(() => {
    const term = this.search().toLowerCase().trim();
    const filtro = this.categoriaFiltro();
    const filtered = this.servicos().filter((s) => {
      const cat = s.categoria?.trim() || SEM_CATEGORIA;
      if (filtro !== null && cat !== filtro) return false;
      if (term && !s.nome.toLowerCase().includes(term)) return false;
      return true;
    });

    const map = new Map<string, Servico[]>();
    for (const s of filtered) {
      const cat = s.categoria?.trim() || SEM_CATEGORIA;
      const arr = map.get(cat) ?? [];
      arr.push(s);
      map.set(cat, arr);
    }

    const ordered = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    return ordered.map(([categoria, servicos]) => ({ categoria, servicos }));
  });

  constructor() {
    void this.carregar();
  }

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  onCategoriaChange(event: MatChipListboxChange): void {
    const value = event.value;
    if (typeof value === 'string' && value.length > 0) {
      this.categoriaFiltro.set(value);
    } else {
      this.categoriaFiltro.set(null);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleServico(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  continuar(): void {
    const ids = this.selectedIds();
    const selected = this.servicos().filter((servico) => ids.has(servico.id));
    if (selected.length === 0) return;
    this.selected.emit(selected);
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.servicosSvc.listAtivos();
      this.servicos.set(list);
    } catch {
      // silencioso — vitrine ficaria vazia, admin pode corrigir
    } finally {
      this.loading.set(false);
      this.servicosLoaded.set(true);
    }
  }
}
