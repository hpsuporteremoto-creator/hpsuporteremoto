import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
import { PixRecebedor, PixRecebedorFormData } from '../financeiro.types';

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
      <span>Chaves PIX</span>
      <span class="spacer"></span>
      <button mat-flat-button type="button" (click)="novaChave()" [disabled]="saving()">
        <mat-icon>add</mat-icon>
        <span>Nova chave</span>
      </button>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      @if (formVisible()) {
        <mat-card appearance="filled">
          <mat-card-header>
            <mat-card-title>{{ editingId() ? 'Editar chave PIX' : 'Cadastrar chave PIX' }}</mat-card-title>
          </mat-card-header>
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
                <mat-hint align="end">{{ form.controls.receiver_name.value.length }}/25</mat-hint>
              </mat-form-field>

              <mat-form-field appearance="outline">
                <mat-label>Cidade do recebedor</mat-label>
                <mat-icon matIconPrefix>location_city</mat-icon>
                <input matInput formControlName="receiver_city" maxlength="15" required />
                <mat-hint align="end">{{ form.controls.receiver_city.value.length }}/15</mat-hint>
              </mat-form-field>

              <div class="form-actions">
                <button mat-stroked-button type="button" (click)="cancelarEdicao()" [disabled]="saving()">
                  Cancelar
                </button>
                <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || saving()">
                  <mat-icon>save</mat-icon>
                  <span>Salvar chave</span>
                </button>
              </div>
            </form>
          </mat-card-content>
        </mat-card>
      }

      <section class="recebedores" aria-label="Chaves PIX cadastradas">
        @if (!loading() && recebedores().length === 0) {
          <p class="empty">Nenhuma chave PIX cadastrada.</p>
        }
        @for (recebedor of recebedores(); track recebedor.id) {
          <mat-card appearance="filled" class="recebedor" [class.inativo]="!recebedor.ativo">
            <mat-card-content>
              <div class="recebedor-main">
                <div>
                  <strong>{{ recebedor.receiver_name }}</strong>
                  <span class="pix-key">{{ recebedor.pix_key }}</span>
                  <small>{{ recebedor.receiver_city }}</small>
                </div>
                <div class="badges">
                  @if (recebedor.padrao) {
                    <span class="badge primary">Padrão</span>
                  }
                  @if (!recebedor.ativo) {
                    <span class="badge">Inativa</span>
                  }
                </div>
              </div>
              <div class="recebedor-actions">
                @if (recebedor.ativo && !recebedor.padrao) {
                  <button mat-stroked-button type="button" (click)="definirPadrao(recebedor)" [disabled]="saving()">
                    <mat-icon>star</mat-icon>
                    <span>Definir padrão</span>
                  </button>
                }
                <button mat-icon-button type="button" (click)="editar(recebedor)" [disabled]="saving()" [attr.aria-label]="'Editar ' + recebedor.receiver_name">
                  <mat-icon>edit</mat-icon>
                </button>
                <button mat-icon-button type="button" (click)="alternarAtivo(recebedor)" [disabled]="saving()" [attr.aria-label]="recebedor.ativo ? 'Desativar ' + recebedor.receiver_name : 'Ativar ' + recebedor.receiver_name">
                  <mat-icon>{{ recebedor.ativo ? 'toggle_on' : 'toggle_off' }}</mat-icon>
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        }
      </section>
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
  protected readonly recebedores = signal<PixRecebedor[]>([]);
  protected readonly formVisible = signal(false);
  protected readonly editingId = signal<string | null>(null);

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

  novaChave(): void {
    this.editingId.set(null);
    this.form.reset({ pix_key: '', receiver_name: '', receiver_city: '' });
    this.formVisible.set(true);
  }

  editar(recebedor: PixRecebedor): void {
    this.editingId.set(recebedor.id);
    this.form.setValue({
      pix_key: recebedor.pix_key,
      receiver_name: recebedor.receiver_name,
      receiver_city: recebedor.receiver_city,
    });
    this.formVisible.set(true);
  }

  cancelarEdicao(): void {
    this.formVisible.set(false);
    this.editingId.set(null);
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    try {
      this.recebedores.set(await this.svc.listPixRecebedores());
    } catch (error) {
      this.showError(error, 'Erro ao carregar chaves PIX');
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    const value = this.form.getRawValue();
    const data: PixRecebedorFormData = {
      pix_key: value.pix_key.trim(),
      receiver_name: value.receiver_name.trim(),
      receiver_city: value.receiver_city.trim(),
    };
    try {
      const id = this.editingId();
      if (id) {
        await this.svc.updatePixRecebedor(id, data);
      } else {
        await this.svc.createPixRecebedor(data);
      }
      this.snackBar.open('Chave PIX salva.', 'OK', { duration: 2500 });
      this.cancelarEdicao();
      await this.carregar();
    } catch (error) {
      this.showError(error, 'Erro ao salvar chave PIX');
    } finally {
      this.saving.set(false);
    }
  }

  async definirPadrao(recebedor: PixRecebedor): Promise<void> {
    this.saving.set(true);
    try {
      await this.svc.definirPixRecebedorPadrao(recebedor.id);
      this.snackBar.open('Chave PIX padrão atualizada.', 'OK', { duration: 2500 });
      await this.carregar();
    } catch (error) {
      this.showError(error, 'Erro ao definir chave padrão');
    } finally {
      this.saving.set(false);
    }
  }

  async alternarAtivo(recebedor: PixRecebedor): Promise<void> {
    this.saving.set(true);
    try {
      await this.svc.togglePixRecebedor(recebedor.id, !recebedor.ativo);
      this.snackBar.open(recebedor.ativo ? 'Chave PIX desativada.' : 'Chave PIX ativada.', 'OK', { duration: 2500 });
      await this.carregar();
    } catch (error) {
      this.showError(error, 'Erro ao atualizar chave PIX');
    } finally {
      this.saving.set(false);
    }
  }

  private showError(error: unknown, fallback: string): void {
    this.snackBar.open(error instanceof Error ? error.message : fallback, 'OK', { duration: 4000 });
  }
}
