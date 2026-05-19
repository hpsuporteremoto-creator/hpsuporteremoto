import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import QRCode from 'qrcode';
import { Atendimento } from '../atendimento.types';
import { IonIcon } from '../../../shared/ion-icon';

@Component({
  selector: 'hp-liquidacao',
  imports: [MatButtonModule, IonIcon],
  template: `
    <div class="liquidacao">
      <header>
        <ion-icon class="check" name="checkmark-circle-outline" />
        <h1>Atendimento finalizado</h1>
        <p class="hint">Pague com PIX para concluir.</p>
      </header>

      @if (valorFormatado(); as valor) {
        <p class="valor">{{ valor }}</p>
      }

      @if (qrCodeDataUrl(); as qr) {
        <img class="qr" [src]="qr" alt="QR Code PIX" width="280" height="280" />
      } @else if (atendimento().pix_brcode) {
        <p class="hint">Gerando QR Code…</p>
      } @else {
        <p class="hint">Aguardando geração do PIX pelo atendente…</p>
      }

      @if (atendimento().pix_brcode; as brcode) {
        <button
          mat-flat-button
          class="copy"
          type="button"
          (click)="copiar(brcode)"
        >
          <ion-icon name="copy-outline" />
          <span>Copiar Chave PIX</span>
        </button>
      }
    </div>
  `,
  styleUrl: './liquidacao.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Liquidacao {
  readonly atendimento = input.required<Atendimento>();
  private readonly snackBar = inject(MatSnackBar);

  protected readonly qrCodeDataUrl = signal<string | null>(null);

  protected readonly valorFormatado = computed(() => {
    const cents = this.atendimento().valor_centavos;
    if (cents === null) return null;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(cents / 100);
  });

  constructor() {
    effect(async () => {
      const brcode = this.atendimento().pix_brcode;
      if (!brcode) {
        this.qrCodeDataUrl.set(null);
        return;
      }
      try {
        const dataUrl = await QRCode.toDataURL(brcode, {
          errorCorrectionLevel: 'M',
          margin: 1,
          width: 280,
          color: { dark: '#121212', light: '#ffffff' },
        });
        this.qrCodeDataUrl.set(dataUrl);
      } catch {
        this.qrCodeDataUrl.set(null);
      }
    });
  }

  async copiar(brcode: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(brcode);
      this.snackBar.open('Chave PIX copiada', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Não foi possível copiar', 'OK', { duration: 3000 });
    }
  }
}
