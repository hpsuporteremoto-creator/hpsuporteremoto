import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'hp-end-to-end-id-help-dialog',
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Sobre o EndToEndId</h2>
    <mat-dialog-content>
      <p>
        O EndToEndId é o identificador único de uma transferência PIX. Ele ajuda a
        conferir um pagamento com o banco de origem.
      </p>
      <section aria-label="Onde localizar">
        <h3>Onde encontrar</h3>
        <p>
          Abra o comprovante ou os detalhes da transação no aplicativo do banco. Procure por
          <strong>EndToEndId</strong>, <strong>Identificador da transação</strong> ou
          <strong>ID da transação</strong>.
        </p>
      </section>
      <section aria-label="Formato">
        <h3>Formato</h3>
        <p>
          Geralmente começa com <code>E</code>, tem 32 caracteres e inclui o ISPB do banco de
          origem. Cole o código completo, sem espaços.
        </p>
      </section>
      <p class="hint">O campo é opcional e não substitui a conferência do pagamento.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" mat-dialog-close>Entendi</button>
    </mat-dialog-actions>
  `,
  styles: `
    :host
      display: block
    mat-dialog-content
      display: grid
      gap: 0.875rem
    p, h3
      margin: 0
    h3
      font-size: 1rem
    code
      overflow-wrap: anywhere
    .hint
      color: var(--mat-sys-on-surface-variant)
      font-size: 0.875rem
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EndToEndIdHelpDialog {}
