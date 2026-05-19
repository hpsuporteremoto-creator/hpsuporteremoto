import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AtendimentoService } from '../atendimento.service';
import { ConexaoFormData, CredenciaisRustDeskData } from '../atendimento.types';

@Component({
  selector: 'hp-credenciais-rustdesk',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="conexao">
      <button mat-button type="button" class="back-btn" (click)="back.emit()">
        <mat-icon>arrow_back</mat-icon>
        <span>Voltar para solicitação</span>
      </button>

      <header>
        <mat-icon class="monitor">desktop_windows</mat-icon>
        <h1>Credenciais do RustDesk</h1>
        <p class="hint">
          Se souber o ID e a senha temporária, informe agora. Também dá pra enviar o pedido sem
          essas credenciais e combinar pelo WhatsApp.
        </p>
      </header>

      @if (submitting()) {
        <mat-progress-bar mode="indeterminate" />
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <section class="rustdesk">
          <mat-form-field appearance="outline">
            <mat-label>ID do RustDesk (opcional)</mat-label>
            <mat-icon matIconPrefix>desktop_windows</mat-icon>
            <input matInput formControlName="rustdesk_id" inputmode="numeric" autocomplete="off" />
            @if (form.controls.rustdesk_id.hasError('minlength')) {
              <mat-error>Informe pelo menos 6 caracteres</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Senha temporária (opcional)</mat-label>
            <mat-icon matIconPrefix>key</mat-icon>
            <input matInput type="text" formControlName="rustdesk_password" autocomplete="off" />
            @if (form.controls.rustdesk_password.hasError('minlength')) {
              <mat-error>Informe pelo menos 4 caracteres</mat-error>
            }
          </mat-form-field>
        </section>

        @if (error(); as message) {
          <p role="alert" class="error">{{ message }}</p>
        }

        <div class="actions">
          <button
            mat-stroked-button
            type="button"
            (click)="enviar({ rustdesk_id: null, rustdesk_password: null })"
            [disabled]="submitting()"
          >
            <mat-icon>skip_next</mat-icon>
            <span>Pular credenciais</span>
          </button>

          <button
            mat-flat-button
            color="primary"
            type="submit"
            [disabled]="form.invalid || submitting()"
          >
            <mat-icon>send</mat-icon>
            <span>{{ submitting() ? 'Enviando...' : 'Enviar pedido' }}</span>
          </button>
        </div>
      </form>
    </div>
  `,
  styleUrl: './conexao-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CredenciaisRustDesk {
  private readonly svc = inject(AtendimentoService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly draft = input.required<ConexaoFormData>();
  readonly created = output<string>();
  readonly back = output<void>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    rustdesk_id: ['', [Validators.minLength(6)]],
    rustdesk_password: ['', [Validators.minLength(4)]],
  });

  onSubmit(): void {
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    void this.enviar({
      rustdesk_id: value.rustdesk_id.trim() || null,
      rustdesk_password: value.rustdesk_password.trim() || null,
    });
  }

  async enviar(credentials: CredenciaisRustDeskData): Promise<void> {
    if (this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);
    try {
      const id = await this.svc.criar({
        ...this.draft(),
        ...credentials,
      });
      this.created.emit(id);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao criar atendimento');
    } finally {
      this.submitting.set(false);
    }
  }
}
