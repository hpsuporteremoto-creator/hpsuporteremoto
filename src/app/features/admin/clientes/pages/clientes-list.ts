import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { ClientesService } from '../clientes.service';
import { Cliente } from '../clientes.types';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';
import { AuthService } from '../../../../core/auth/auth.service';

@Component({
  selector: 'hp-clientes-list',
  imports: [
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
      <span>Clientes</span>
      <span class="spacer"></span>
      <a mat-flat-button color="primary" routerLink="novo" aria-label="Novo cliente">
        <mat-icon>add</mat-icon>
        <span>Novo cliente</span>
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

      @if (clientes(); as list) {
        <section class="search-area" aria-label="Busca de clientes">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Filtrar clientes</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              type="search"
              placeholder="Ex.: nome, email, WhatsApp ou observação"
              [value]="searchTerm()"
              (input)="onSearch($event)"
              autocomplete="off"
            />
            @if (searchTerm()) {
              <button
                mat-icon-button
                matSuffix
                type="button"
                (click)="clearSearch()"
                aria-label="Limpar busca"
              >
                <mat-icon>close</mat-icon>
              </button>
            }
          </mat-form-field>

          <p class="result-count" aria-live="polite">{{ resultTotal() }} clientes encontrados</p>
        </section>

        @if (resultTotal() === 0) {
          <p class="empty">{{ emptyMessage() }}</p>
        } @else {
          <div class="list">
            @for (cliente of list; track cliente.id) {
              <mat-card
                class="cliente-card"
                appearance="filled"
                [class.inativo]="!cliente.ativo"
                tabindex="0"
                role="link"
                [attr.aria-label]="clienteActionLabel(cliente)"
                (click)="abrirAtendimentos(cliente)"
                (keydown.enter)="abrirAtendimentos(cliente)"
                (keydown.space)="abrirAtendimentos(cliente); $event.preventDefault()"
              >
                <mat-card-content class="row">
                  <div class="info">
                    <strong class="nome">{{ cliente.nome }}</strong>
                    <small class="whatsapp">{{ formatWhatsapp(cliente.whatsapp) }}</small>
                    @if (cliente.email) {
                      <small class="email">{{ cliente.email }}</small>
                    }
                    @if (cliente.observacao) {
                      <small class="observacao">{{ cliente.observacao }}</small>
                    }
                    @if (cliente.cadastrado_por) {
                      <small class="operator-line">
                        <mat-icon>person_add</mat-icon>
                        <span>Cadastrado por {{ operadorLabel(cliente.cadastrado_por) }}</span>
                      </small>
                    }
                  </div>
                  <div class="actions">
                    <mat-slide-toggle
                      [checked]="cliente.ativo"
                      (click)="$event.stopPropagation()"
                      (change)="onToggle(cliente, $event.checked)"
                      aria-label="Ativo"
                    />
                    <a
                      mat-icon-button
                      [routerLink]="[cliente.id, 'editar']"
                      (click)="$event.stopPropagation()"
                      aria-label="Editar"
                    >
                      <mat-icon>edit</mat-icon>
                    </a>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>

          @if (resultTotal() > pageSize) {
            <mat-paginator
              [length]="resultTotal()"
              [pageSize]="pageSize"
              [pageIndex]="pageIndex()"
              hidePageSize
              (page)="onPage($event)"
            />
          }
        }
      }
    </main>
  `,
  styleUrl: './clientes-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientesListPage {
  private readonly svc = inject(ClientesService);
  protected readonly auth = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatWhatsapp = formatWhatsappDisplay;
  protected readonly clientes = signal<Cliente[] | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly tabIndex = signal(0);
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = 20;
  protected readonly activeTotal = signal(0);
  protected readonly inactiveTotal = signal(0);
  protected readonly resultTotal = signal(0);
  protected readonly emptyMessage = computed(() => {
    if (this.searchTerm()) return 'Nenhum cliente encontrado para este filtro.';
    return this.tabIndex() === 0
      ? 'Nenhum cliente ativo encontrado.'
      : 'Nenhum cliente inativo encontrado.';
  });
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.applyQueryParams();
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.searchTerm.set(input?.value ?? '');
    this.pageIndex.set(0);
    this.scheduleCarregar();
  }

  clearSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = null;
    this.searchTerm.set('');
    this.pageIndex.set(0);
    void this.syncQueryParams();
    void this.carregar();
  }

  onTabChange(index: number): void {
    this.tabIndex.set(index);
    this.pageIndex.set(0);
    void this.syncQueryParams();
    void this.carregar();
  }

  onPage(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    void this.syncQueryParams();
    void this.carregar();
  }

  abrirAtendimentos(cliente: Cliente): void {
    void this.router.navigate(['/admin/atendimentos'], {
      queryParams: {
        clienteId: cliente.id,
        clienteNome: cliente.nome,
      },
    });
  }

  clienteActionLabel(cliente: Cliente): string {
    return `Ver atendimentos de ${cliente.nome}`;
  }

  operadorLabel(operador: Cliente['cadastrado_por']): string {
    return operador?.full_name?.trim() || operador?.email || 'usuário';
  }

  async carregar(): Promise<void> {
    this.searchTimer = null;
    this.loading.set(true);
    this.error.set(null);
    try {
      const [counts, result] = await Promise.all([
        this.svc.counts(),
        this.svc.list({
          ativo: this.tabIndex() === 0,
          termo: this.searchTerm(),
          pageIndex: this.pageIndex(),
          pageSize: this.pageSize,
        }),
      ]);
      this.activeTotal.set(counts.ativos);
      this.inactiveTotal.set(counts.inativos);
      this.resultTotal.set(result.total);
      this.clientes.set(result.clientes);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar clientes');
    } finally {
      this.loading.set(false);
    }
  }

  async onToggle(cliente: Cliente, ativo: boolean): Promise<void> {
    try {
      await this.svc.toggleAtivo(cliente.id, ativo);
      await this.carregar();
      this.snackBar.open(`Cliente ${ativo ? 'ativado' : 'desativado'}`, 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }

  private scheduleCarregar(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      void this.syncQueryParams();
      void this.carregar();
    }, 250);
  }

  private applyQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const termo = params.get('q')?.trim() ?? '';
    const tab = params.get('tab');
    const page = Number(params.get('page') ?? '1');
    this.searchTerm.set(termo);
    this.tabIndex.set(tab === 'inativos' ? 1 : 0);
    this.pageIndex.set(Number.isInteger(page) && page > 1 ? page - 1 : 0);
  }

  private syncQueryParams(): Promise<boolean> {
    const termo = this.searchTerm().trim();
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: termo || null,
        tab: this.tabIndex() === 1 ? 'inativos' : null,
        page: this.pageIndex() > 0 ? this.pageIndex() + 1 : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
