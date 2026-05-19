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
import { ServicosService } from '../servicos.service';
import { Servico } from '../servicos.types';

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

@Component({
  selector: 'hp-servicos-list',
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
      <span>Serviços</span>
      <span class="spacer"></span>
      <a mat-icon-button routerLink="novo" aria-label="Novo serviço">
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

      @if (servicos(); as list) {
        @if (list.length === 0) {
          <p class="empty">Nenhum serviço cadastrado ainda.</p>
        } @else {
          <div class="list">
            @for (servico of list; track servico.id) {
              <mat-card
                class="servico-card"
                appearance="filled"
                [class.inativo]="!servico.ativo"
              >
                <mat-card-content class="row">
                  <div class="info">
                    <strong class="nome">{{ servico.nome }}</strong>
                    <span class="valor">{{ formatar(servico.valor_centavos) }}</span>
                  </div>
                  <div class="actions">
                    <mat-slide-toggle
                      [checked]="servico.ativo"
                      (change)="onToggle(servico, $event.checked)"
                      aria-label="Ativo"
                    />
                    <a
                      mat-icon-button
                      [routerLink]="[servico.id, 'editar']"
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
  styleUrl: './servicos-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicosListPage {
  private readonly svc = inject(ServicosService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly location = inject(Location);

  protected readonly servicos = signal<Servico[] | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  formatar(cents: number): string {
    return BRL.format(cents / 100);
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.svc.list();
      this.servicos.set(data);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao carregar serviços',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onToggle(servico: Servico, ativo: boolean): Promise<void> {
    try {
      await this.svc.toggleAtivo(servico.id, ativo);
      this.servicos.update(
        (list) =>
          list?.map((s) => (s.id === servico.id ? { ...s, ativo } : s)) ?? null,
      );
      this.snackBar.open(
        `Serviço ${ativo ? 'ativado' : 'desativado'}`,
        'OK',
        { duration: 2500 },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    }
  }
}
