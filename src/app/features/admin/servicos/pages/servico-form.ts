import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ServicosService } from '../servicos.service';
import { ServicoFormData } from '../servicos.types';

@Component({
  selector: 'hp-servico-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>{{ isNew() ? 'Novo serviço' : 'Editar serviço' }}</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline">
              <mat-label>Nome do serviço</mat-label>
              <input matInput formControlName="nome" required />
              @if (form.controls.nome.hasError('required')) {
                <mat-error>Nome é obrigatório</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Valor (R$)</mat-label>
              <span matTextPrefix>R$&nbsp;</span>
              <input
                matInput
                type="number"
                step="0.01"
                min="0"
                formControlName="valor_reais"
                required
              />
              @if (form.controls.valor_reais.hasError('required')) {
                <mat-error>Valor é obrigatório</mat-error>
              } @else if (form.controls.valor_reais.hasError('min')) {
                <mat-error>Valor não pode ser negativo</mat-error>
              }
            </mat-form-field>

            <mat-slide-toggle formControlName="ativo">Serviço ativo</mat-slide-toggle>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving() || loading()"
              >
                <mat-icon>save</mat-icon>
                <span>{{ isNew() ? 'Criar' : 'Salvar' }}</span>
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styleUrl: './servico-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicoFormPage {
  private readonly svc = inject(ServicosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly id = signal<string | null>(null);
  protected readonly isNew = computed(() => this.id() === null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    valor_reais: [0, [Validators.required, Validators.min(0)]],
    ativo: [true],
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.id.set(idParam);
      void this.carregar(idParam);
    }
  }

  voltar(): void {
    this.location.back();
  }

  async carregar(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const servico = await this.svc.get(id);
      if (!servico) {
        this.snackBar.open('Serviço não encontrado', 'OK', { duration: 4000 });
        this.router.navigate(['/admin/servicos']);
        return;
      }
      this.form.setValue({
        nome: servico.nome,
        valor_reais: servico.valor_centavos / 100,
        ativo: servico.ativo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const value = this.form.getRawValue();
    const data: ServicoFormData = {
      nome: value.nome.trim(),
      valor_centavos: Math.round(value.valor_reais * 100),
      ativo: value.ativo,
    };

    try {
      const id = this.id();
      if (id) {
        await this.svc.update(id, data);
        this.snackBar.open('Serviço atualizado', 'OK', { duration: 3000 });
      } else {
        await this.svc.create(data);
        this.snackBar.open('Serviço criado', 'OK', { duration: 3000 });
      }
      this.router.navigate(['/admin/servicos']);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
