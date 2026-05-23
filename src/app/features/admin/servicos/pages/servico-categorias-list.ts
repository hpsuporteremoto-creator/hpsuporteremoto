import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ServicoCategoriasService } from '../servicos.service';
import { ServicoCategoria } from '../servicos.types';

@Component({
  selector: 'hp-servico-categorias-list',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Categorias de serviço</span>
      <span class="spacer"></span>
      <a mat-flat-button color="primary" routerLink="nova" aria-label="Nova categoria">
        <mat-icon>add</mat-icon>
        <span>Nova categoria</span>
      </a>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (error(); as msg) {
        <p class="error">{{ msg }}</p>
      }

      @if (categorias(); as list) {
        @if (list.length === 0) {
          <p class="empty">Nenhuma categoria cadastrada.</p>
        } @else {
          <div class="list">
            @for (categoria of list; track categoria.id) {
              <mat-card
                appearance="filled"
                class="categoria-card"
                [class.inativa]="!categoria.ativo"
              >
                <mat-card-content class="row">
                  <div class="info">
                    <strong>{{ categoria.nome }}</strong>
                    @if (categoria.descricao) {
                      <span>{{ categoria.descricao }}</span>
                    }
                  </div>
                  <div class="actions">
                    <mat-slide-toggle
                      [checked]="categoria.ativo"
                      (change)="onToggle(categoria, $event.checked)"
                      aria-label="Categoria ativa"
                    />
                    <a
                      mat-icon-button
                      [routerLink]="[categoria.id, 'editar']"
                      aria-label="Editar categoria"
                    >
                      <mat-icon>edit</mat-icon>
                    </a>
                    <button
                      mat-icon-button
                      type="button"
                      (click)="apagar(categoria)"
                      aria-label="Apagar categoria"
                    >
                      <mat-icon>delete_outline</mat-icon>
                    </button>
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </div>
        }
      }
    </main>
  `,
  styleUrl: './servico-categorias-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicoCategoriasListPage {
  private readonly svc = inject(ServicoCategoriasService);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly categorias = signal<ServicoCategoria[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.categorias.set(await this.svc.list());
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar categorias',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onToggle(categoria: ServicoCategoria, ativo: boolean): Promise<void> {
    try {
      await this.svc.toggleAtivo(categoria.id, ativo);
      await this.carregar();
      this.snackBar.open(
        `Categoria ${ativo ? 'ativada' : 'desativada'}`,
        'OK',
        { duration: 2500 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }

  async apagar(categoria: ServicoCategoria): Promise<void> {
    const ok = confirm(
      `Apagar "${categoria.nome}"? Categorias em uso por serviços não podem ser apagadas.`,
    );
    if (!ok) return;
    try {
      await this.svc.delete(categoria.id);
      await this.carregar();
      this.snackBar.open('Categoria apagada', 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao apagar';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }
}
