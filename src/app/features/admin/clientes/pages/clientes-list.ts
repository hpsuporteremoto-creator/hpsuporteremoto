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
import { ClientesService } from '../clientes.service';
import { Cliente } from '../clientes.types';

@Component({
  selector: 'hp-clientes-list',
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
        @if (list.length === 0) {
          <p class="empty">Nenhum cliente cadastrado ainda.</p>
        } @else {
          <div class="list">
            @for (cliente of list; track cliente.id) {
              <mat-card
                class="cliente-card"
                appearance="filled"
                [class.inativo]="!cliente.ativo"
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
                      (change)="onToggle(cliente, $event.checked)"
                      aria-label="Ativo"
                    />
                    <a
                      mat-icon-button
                      [routerLink]="[cliente.id, 'editar']"
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

  protected readonly clientes = signal<Cliente[] | null>(null);
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
