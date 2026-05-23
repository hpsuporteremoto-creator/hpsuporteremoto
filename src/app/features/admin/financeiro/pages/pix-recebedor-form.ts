import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FinanceiroService } from '../financeiro.service';
import { PixRecebedorConfigFormData } from '../financeiro.types';

@Component({
  selector: 'hp-pix-recebedor-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Recebedor PIX</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline">
              <mat-label>Chave PIX</mat-label>
              <mat-icon matIconPrefix>key</mat-icon>
              <input matInput formControlName="pix_key" required />
              @if (form.controls.pix_key.hasError('required')) {
                <mat-error>Chave PIX é obrigatória</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Nome do recebedor</mat-label>
              <mat-icon matIconPrefix>badge</mat-icon>
              <input matInput formControlName="receiver_name" maxlength="25" required />
              <mat-hint align="end">
                {{ form.controls.receiver_name.value.length }}/25
              </mat-hint>
              @if (form.controls.receiver_name.hasError('required')) {
                <mat-error>Nome do recebedor é obrigatório</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Cidade do recebedor</mat-label>
              <mat-icon matIconPrefix>location_city</mat-icon>
              <input matInput formControlName="receiver_city" maxlength="15" required />
              <mat-hint align="end">
                {{ form.controls.receiver_city.value.length }}/15
              </mat-hint>
              @if (form.controls.receiver_city.hasError('required')) {
                <mat-error>Cidade do recebedor é obrigatória</mat-error>
              }
            </mat-form-field>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving() || loading()"
              >
                <mat-icon>save</mat-icon>
                <span>Salvar recebedor</span>
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './pix-recebedor-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PixRecebedorFormPage {
  private readonly svc = inject(FinanceiroService);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    pix_key: ['', [Validators.required, Validators.minLength(2)]],
    receiver_name: ['', [Validators.required, Validators.maxLength(25)]],
    receiver_city: ['', [Validators.required, Validators.maxLength(15)]],
  });

  constructor() {
    void this.carregar();
  }

  voltar(): void {
    this.location.back();
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    try {
      const config = await this.svc.getPixRecebedorConfig();
      this.form.setValue({
        pix_key: config?.pix_key ?? '',
        receiver_name: config?.receiver_name ?? '',
        receiver_city: config?.receiver_city ?? '',
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao carregar recebedor PIX';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    const value = this.form.getRawValue();
    const data: PixRecebedorConfigFormData = {
      pix_key: value.pix_key.trim(),
      receiver_name: value.receiver_name.trim(),
      receiver_city: value.receiver_city.trim(),
    };

    try {
      await this.svc.savePixRecebedorConfig(data);
      this.snackBar.open('Recebedor PIX salvo', 'OK', { duration: 3000 });
      this.location.back();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
