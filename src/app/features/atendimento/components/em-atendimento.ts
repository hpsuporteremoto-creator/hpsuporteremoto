import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'hp-em-atendimento',
  imports: [MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="lock">
      <mat-progress-spinner mode="indeterminate" diameter="80" />
      <h1>Suporte em andamento</h1>
      <p>Não feche o RustDesk. Aguarde até o atendente finalizar.</p>
    </div>
  `,
  styleUrl: './em-atendimento.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmAtendimento {}
