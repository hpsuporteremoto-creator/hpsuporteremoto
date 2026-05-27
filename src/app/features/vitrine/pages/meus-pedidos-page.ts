import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '../../../core/auth/auth.service';
import { VitrineService } from '../vitrine.service';
import { MeuPedido, MeuPedidoState } from '../vitrine.types';

const PEDIDO_STATE_LABEL: Readonly<Record<MeuPedidoState, string>> = {
  aguardando_confirmacao: 'Em andamento',
  recusado: 'Recusado',
  em_andamento: 'Em andamento',
  pagamento: 'Pagamento',
  concluido: 'Concluído',
};

@Component({
  selector: 'hp-meus-pedidos-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  template: `
    <header class="site-header">
      <a class="brand" routerLink="/" aria-label="HP Suporte Remoto">
        <span class="brand-mark">HP</span>
        <span>
          <strong>HP Suporte Remoto</strong>
          <small>Pedidos</small>
        </span>
      </a>

      <nav class="header-actions" aria-label="Ações do site">
        <a mat-button routerLink="/">
          <mat-icon>storefront</mat-icon>
          <span>Vitrine</span>
        </a>
        @if (auth.user(); as user) {
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
      <section class="page-title" aria-labelledby="pedidos-title">
        <p>Área do cliente</p>
        <h1 id="pedidos-title">Meus pedidos</h1>
      </section>

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (!auth.user()) {
        <mat-card class="empty-card" appearance="filled">
          <mat-card-content>
            <mat-icon>lock</mat-icon>
            <strong>Entre com Google para ver seus pedidos.</strong>
            <button mat-flat-button color="primary" type="button" (click)="login()">
              <mat-icon>login</mat-icon>
              <span>Entrar com Google</span>
            </button>
          </mat-card-content>
        </mat-card>
      } @else if (!loading() && pedidos().length === 0) {
        <mat-card class="empty-card" appearance="filled">
          <mat-card-content>
            <mat-icon>assignment</mat-icon>
            <strong>Nenhum pedido encontrado para este e-mail.</strong>
          </mat-card-content>
        </mat-card>
      } @else {
        <section class="pedido-list" aria-label="Lista de pedidos">
          @for (pedido of pedidos(); track pedido.id) {
            <mat-card class="pedido-card" appearance="filled">
              <mat-card-content>
                <div class="pedido-heading">
                  <div>
                    <span class="state">{{ stateLabel(pedido.state) }}</span>
                    <h2>Pedido de {{ pedido.created_at | date: 'dd/MM/yyyy' }}</h2>
                  </div>
                  @if (pedido.valor_centavos !== null) {
                    <strong class="valor">
                      {{ pedido.valor_centavos / 100 | currency }}
                    </strong>
                  }
                </div>

                @if (pedido.servicos_solicitados.length > 0) {
                  <ul class="servicos">
                    @for (servico of pedido.servicos_solicitados; track servico.id) {
                      <li>
                        <span>
                          @if (servico.quantidade > 1) {
                            {{ servico.quantidade }}x
                          }
                          {{ servico.nome }}
                        </span>
                        <strong>{{ servico.subtotal_centavos / 100 | currency }}</strong>
                      </li>
                    }
                  </ul>
                } @else if (pedido.servico; as servico) {
                  <ul class="servicos">
                    <li>
                      <span>{{ servico.nome }}</span>
                      <strong>{{ servico.valor_centavos / 100 | currency }}</strong>
                    </li>
                  </ul>
                }

                @if (pedido.descricao_solicitacao) {
                  <p class="descricao">{{ pedido.descricao_solicitacao }}</p>
                }
              </mat-card-content>
            </mat-card>
          }
        </section>
      }
    </main>
  `,
  styleUrl: './meus-pedidos-page.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MeusPedidosPage {
  protected readonly auth = inject(AuthService);
  private readonly vitrine = inject(VitrineService);

  protected readonly pedidos = signal<MeuPedido[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.carregar();
  }

  stateLabel(state: MeuPedidoState): string {
    return PEDIDO_STATE_LABEL[state];
  }

  async carregar(): Promise<void> {
    await this.auth.ready;
    if (!this.auth.user()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.pedidos.set(await this.vitrine.listMeusPedidos());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar pedidos');
    } finally {
      this.loading.set(false);
    }
  }

  async login(): Promise<void> {
    await this.auth.signInWithGoogle('/meus-pedidos');
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.pedidos.set([]);
  }
}
