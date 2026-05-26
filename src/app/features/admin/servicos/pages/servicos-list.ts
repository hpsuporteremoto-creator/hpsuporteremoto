import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CurrencyPipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ServicosService } from '../servicos.service';
import { Servico } from '../servicos.types';

@Component({
  selector: 'hp-servicos-list',
  imports: [
    CurrencyPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
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
      <a
        mat-stroked-button
        routerLink="categorias"
        aria-label="Gerenciar categorias"
      >
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

      @if (servicos(); as list) {
        @if (list.length === 0) {
          <p class="empty">{{ emptyMessage() }}</p>
        } @else {
          <div class="list">
            @for (servico of list; track servico.id) {
              <mat-card
                class="servico-card"
                appearance="filled"
                [class.inativo]="!servico.ativo"
              >
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
                      <small class="vitrine">Vitrine</small>
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
  protected readonly tabIndex = signal(0);
  protected readonly activeTotal = signal(0);
  protected readonly inactiveTotal = signal(0);
  protected readonly emptyMessage = computed(() =>
    this.tabIndex() === 0
      ? 'Nenhum serviço ativo cadastrado.'
      : 'Nenhum serviço inativo cadastrado.',
  );

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
      await this.carregar();
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
