import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { FinanceiroService } from '../financeiro.service';
import { TransacaoFormData, TransacaoTipo } from '../financeiro.types';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'hp-transacao-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
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
      <span>Nova transação</span>
    </mat-toolbar>

    @if (saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-button-toggle-group
              formControlName="tipo"
              hideSingleSelectionIndicator
              class="tipo-toggle"
              aria-label="Tipo"
            >
              <mat-button-toggle value="entrada">
                <mat-icon>trending_up</mat-icon>
                <span>Entrada</span>
              </mat-button-toggle>
              <mat-button-toggle value="saida">
                <mat-icon>trending_down</mat-icon>
                <span>Saída</span>
              </mat-button-toggle>
            </mat-button-toggle-group>

            <mat-form-field appearance="outline">
              <mat-label>Descrição</mat-label>
              <input matInput formControlName="descricao" required />
              @if (form.controls.descricao.hasError('required')) {
                <mat-error>Descrição é obrigatória</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Valor</mat-label>
              <span matTextPrefix>R$&nbsp;</span>
              <input
                matInput
                type="number"
                step="0.01"
                min="0.01"
                formControlName="valor_reais"
                required
              />
              @if (
                form.controls.valor_reais.hasError('required') ||
                form.controls.valor_reais.hasError('min')
              ) {
                <mat-error>Informe um valor maior que zero</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Data</mat-label>
              <input matInput type="date" formControlName="data" required />
            </mat-form-field>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving()"
              >
                <mat-icon>save</mat-icon>
                <span>Salvar</span>
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './transacao-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TransacaoFormPage {
  private readonly svc = inject(FinanceiroService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    tipo: ['saida' as TransacaoTipo, [Validators.required]],
    descricao: ['', [Validators.required, Validators.minLength(2)]],
    valor_reais: [0, [Validators.required, Validators.min(0.01)]],
    data: [todayISO(), [Validators.required]],
  });

  voltar(): void {
    this.location.back();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const value = this.form.getRawValue();
    const data: TransacaoFormData = {
      tipo: value.tipo,
      descricao: value.descricao.trim(),
      valor_centavos: Math.round(value.valor_reais * 100),
      data: value.data,
      atendimento_id: null,
    };

    try {
      await this.svc.create(data);
      this.snackBar.open('Transação criada', 'OK', { duration: 3000 });
      this.router.navigate(['/admin/financeiro']);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
