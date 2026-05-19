import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AtendimentoService } from '../atendimento.service';

@Component({
  selector: 'hp-whatsapp-step',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="step">
      <header>
        <mat-icon class="chat">chat</mat-icon>
        <h1>Vamos começar</h1>
        <p class="hint">
          Informe seu WhatsApp pra agilizar o atendimento. Se você já foi
          cliente, vamos puxar seus dados automaticamente.
        </p>
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <mat-form-field appearance="outline">
          <mat-label>WhatsApp</mat-label>
          <mat-icon matIconPrefix>chat</mat-icon>
          <input
            matInput
            type="tel"
            formControlName="whatsapp"
            autocomplete="tel"
            placeholder="(11) 99999-9999"
            required
          />
          @if (form.controls.whatsapp.hasError('required')) {
            <mat-error>WhatsApp é obrigatório</mat-error>
          } @else if (form.controls.whatsapp.hasError('minlength')) {
            <mat-error>Informe pelo menos 10 dígitos</mat-error>
          }
        </mat-form-field>

        @if (error(); as msg) {
          <p role="alert" class="error">{{ msg }}</p>
        }

        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="form.invalid || loading()"
        >
          <mat-icon>arrow_forward</mat-icon>
          <span>Continuar</span>
        </button>
      </form>
    </div>
  `,
  styleUrl: './whatsapp-step.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappStep {
  private readonly svc = inject(AtendimentoService);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    whatsapp: ['', [Validators.required, Validators.minLength(10)]],
  });

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.svc.lookupPorWhatsapp(this.form.getRawValue().whatsapp);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao consultar WhatsApp',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
