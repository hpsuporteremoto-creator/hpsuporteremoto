import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NotificationService } from '../../../core/notifications/notification.service';
import { FunilStepper } from '../../../shared/funil-stepper';
import { AtendimentoService } from '../atendimento.service';
import { ConexaoForm } from '../components/conexao-form';
import { EmAtendimento } from '../components/em-atendimento';
import { Liquidacao } from '../components/liquidacao';

@Component({
  selector: 'hp-atendimento-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    FunilStepper,
    ConexaoForm,
    EmAtendimento,
    Liquidacao,
  ],
  template: `
    <a
      routerLink="/login"
      mat-icon-button
      class="admin-link"
      aria-label="Acesso admin"
      title="Acesso admin"
    >
      <mat-icon>lock</mat-icon>
    </a>

    <main class="page">
      <mat-card class="atendimento-card" appearance="filled">
        <div class="stepper-wrap">
          <hp-funil-stepper [currentState]="svc.state()" />
        </div>

        @if (svc.state() === null) {
          <hp-conexao-form (created)="onCreated($event)" />
        } @else {
          @switch (svc.state()) {
            @case ('aguardando_confirmacao') {
              <div class="status status-aguardando">
                <mat-progress-spinner mode="indeterminate" diameter="64" />
                <h1>Solicitação enviada</h1>
                <p>
                  Estamos verificando sua solicitação. Aguarde alguns instantes
                  que um atendente vai confirmar e iniciar o suporte.
                </p>
                <p class="hint">Mantenha o RustDesk aberto.</p>
              </div>
            }
            @case ('em_andamento') {
              <hp-em-atendimento />
            }
            @case ('faturamento') {
              <div class="status status-faturamento">
                <mat-progress-spinner mode="indeterminate" diameter="64" />
                <h1>Calculando o valor</h1>
                <p>
                  O atendente está finalizando os detalhes do serviço. Em
                  instantes você verá a cobrança PIX.
                </p>
              </div>
            }
            @case ('pagamento') {
              @if (svc.atendimento(); as atendimento) {
                <hp-liquidacao [atendimento]="atendimento" />
              }
            }
            @case ('concluido') {
              <div class="status status-concluido">
                <mat-icon class="check">check_circle</mat-icon>
                <h1>Atendimento concluído</h1>
                <p>Obrigado pela confiança! Você pode fechar esta janela.</p>
                <button mat-stroked-button (click)="svc.limpar()">
                  Novo atendimento
                </button>
              </div>
            }
          }
        }
      </mat-card>

      @if (notifications.canRequest()) {
        <button
          mat-stroked-button
          class="enable-notifs"
          type="button"
          (click)="ativarNotificacoes()"
        >
          <mat-icon>notifications</mat-icon>
          <span>Ativar notificações de status</span>
        </button>
      }
    </main>
  `,
  styleUrl: './atendimento-page.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtendimentoPage {
  protected readonly svc = inject(AtendimentoService);
  protected readonly notifications = inject(NotificationService);

  onCreated(_id: string): void {
    // Service já assinou realtime; @switch reage automaticamente.
  }

  async ativarNotificacoes(): Promise<void> {
    await this.notifications.requestPermission();
  }
}
