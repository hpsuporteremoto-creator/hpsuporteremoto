import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { AtendimentoService } from '../atendimento.service';
import { ConexaoForm } from '../components/conexao-form';
import { EmAtendimento } from '../components/em-atendimento';
import { Liquidacao } from '../components/liquidacao';
import { IonIcon } from '../../../shared/ion-icon';

@Component({
  selector: 'hp-atendimento-page',
  imports: [
    RouterLink,
    MatButtonModule,
    MatCardModule,
    IonIcon,
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
      <ion-icon name="lock-closed-outline" />
    </a>

    <main class="page">
      <mat-card class="atendimento-card" appearance="filled">
        @switch (svc.state()) {
          @case ('conexao') {
            <hp-conexao-form (created)="onCreated($event)" />
          }
          @case ('em_atendimento') {
            <hp-em-atendimento />
          }
          @case ('liquidacao') {
            @if (svc.atendimento(); as atendimento) {
              <hp-liquidacao [atendimento]="atendimento" />
            }
          }
          @case ('finalizado') {
            <div class="finalizado">
              <h2>Atendimento finalizado</h2>
              <p>Obrigado! Você pode fechar esta janela.</p>
            </div>
          }
          @default {
            <hp-conexao-form (created)="onCreated($event)" />
          }
        }
      </mat-card>
    </main>
  `,
  styleUrl: './atendimento-page.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtendimentoPage {
  protected readonly svc = inject(AtendimentoService);

  onCreated(_id: string): void {
    // O service já atualizou o signal `atendimento` e assinou o realtime
    // durante svc.criar(). Nada a fazer aqui — @switch reage automaticamente.
  }
}
