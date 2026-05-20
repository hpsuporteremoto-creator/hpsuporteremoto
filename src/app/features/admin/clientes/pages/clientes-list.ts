import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ClientesService } from '../clientes.service';
import { Cliente } from '../clientes.types';

@Component({
  selector: 'hp-clientes-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Clientes</span>
      <span class="spacer"></span>
      <a mat-icon-button routerLink="novo" aria-label="Novo cliente">
        <mat-icon>add</mat-icon>
      </a>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (clientes(); as list) {
        <section class="search-area" aria-label="Busca de clientes">
          <mat-form-field appearance="outline" class="search-field">
            <mat-label>Buscar cliente</mat-label>
            <mat-icon matPrefix>search</mat-icon>
            <input
              matInput
              type="search"
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

          <p class="result-count" aria-live="polite">
            {{ filteredClientes().length }} de {{ list.length }} clientes
          </p>
        </section>

        @if (list.length === 0) {
          <p class="empty">Nenhum cliente cadastrado ainda.</p>
        } @else if (filteredClientes().length === 0) {
          <p class="empty">Nenhum cliente encontrado.</p>
        } @else {
          <div class="list">
            @for (cliente of filteredClientes(); track cliente.id) {
              <mat-card
                class="cliente-card"
                appearance="filled"
                [class.inativo]="!cliente.ativo"
                tabindex="0"
                role="link"
                [attr.aria-label]="'Ver atendimentos de ' + cliente.nome"
                (click)="abrirAtendimentos(cliente)"
                (keydown.enter)="abrirAtendimentos(cliente)"
                (keydown.space)="abrirAtendimentos(cliente); $event.preventDefault()"
              >
                <mat-card-content class="row">
                  <div class="info">
                    <strong class="nome">{{ cliente.nome }}</strong>
                    <small class="whatsapp">{{ cliente.whatsapp }}</small>
                    @if (cliente.email) {
                      <small class="email">{{ cliente.email }}</small>
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
        }
      }
    </main>
  `,
  styleUrl: './clientes-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientesListPage {
  private readonly svc = inject(ClientesService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  protected readonly clientes = signal<Cliente[] | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly filteredClientes = computed(() => {
    const term = normalizeSearch(this.searchTerm());
    const list = this.clientes() ?? [];
    if (!term) return list;
    return list.filter((cliente) =>
      [
        cliente.nome,
        cliente.whatsapp,
        cliente.email ?? '',
        cliente.instagram ?? '',
      ].some((value) => normalizeSearch(value).includes(term)),
    );
  });

  constructor() {
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.searchTerm.set(input?.value ?? '');
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  abrirAtendimentos(cliente: Cliente): void {
    void this.router.navigate(['/admin/atendimentos'], {
      queryParams: {
        clienteId: cliente.id,
        clienteNome: cliente.nome,
      },
    });
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.svc.list();
      this.clientes.set(data);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar clientes',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onToggle(cliente: Cliente, ativo: boolean): Promise<void> {
    try {
      await this.svc.toggleAtivo(cliente.id, ativo);
      this.clientes.update(
        (list) =>
          list?.map((c) => (c.id === cliente.id ? { ...c, ativo } : c)) ?? null,
      );
      this.snackBar.open(
        `Cliente ${ativo ? 'ativado' : 'desativado'}`,
        'OK',
        { duration: 2500 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
