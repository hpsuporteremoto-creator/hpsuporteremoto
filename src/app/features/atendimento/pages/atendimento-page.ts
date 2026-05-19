import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { AtendimentoService } from '../atendimento.service';
import { ConexaoForm } from '../components/conexao-form';
import { EmAtendimento } from '../components/em-atendimento';
import { Liquidacao } from '../components/liquidacao';

@Component({
  selector: 'hp-atendimento-page',
  imports: [MatCardModule, ConexaoForm, EmAtendimento, Liquidacao],
  template: `
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
