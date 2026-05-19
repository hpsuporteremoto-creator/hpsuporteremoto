import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CurrencyPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Servico } from '../../admin/servicos/servicos.types';
import { ClienteLookupResult, ConexaoFormData } from '../atendimento.types';

@Component({
  selector: 'hp-conexao-form',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    CdkTextareaAutosize,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="conexao">
      <div class="back-row">
        <button mat-button type="button" class="back-btn" (click)="backToVitrine.emit()">
          <mat-icon>arrow_back</mat-icon>
          <span>Trocar serviço</span>
        </button>
        <button mat-button type="button" class="back-btn" (click)="back.emit()">
          <mat-icon>edit</mat-icon>
          <span>Trocar WhatsApp</span>
        </button>
      </div>

      <header>
        @let pre = preFill();
        @if (pre?.cliente_existe && pre?.nome) {
          <mat-icon class="welcome">waving_hand</mat-icon>
          <h1>Olá, {{ pre?.nome }}!</h1>
          <p class="hint">
            Confirme/atualize seus dados e descreva o problema que você precisa resolver.
          </p>
        } @else {
          <mat-icon class="monitor">edit_note</mat-icon>
          <h1>Solicitar atendimento</h1>
          <p class="hint">
            Conte rapidamente o que você precisa. As credenciais do RustDesk entram na próxima
            etapa, se você já tiver em mãos.
          </p>
        }
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (servicos().length > 0) {
        <section class="servico-resumo">
          <h2>Serviços escolhidos</h2>
          @for (s of servicos(); track s.id) {
            <div class="servico-pill">
              <mat-icon>design_services</mat-icon>
              <span class="servico-nome">{{ s.nome }}</span>
              <span class="servico-valor">{{ s.valor_centavos / 100 | currency }}</span>
            </div>
          }
        </section>
      }

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <section class="descricao">
          <mat-form-field appearance="outline">
            <mat-label>Conte o que está acontecendo (opcional)</mat-label>
            <textarea
              matInput
              cdkTextareaAutosize
              cdkAutosizeMinRows="3"
              cdkAutosizeMaxRows="8"
              formControlName="descricao_solicitacao"
              placeholder="Ex: meu computador está lento depois do último update do Windows, alguns programas travam ao abrir…"
            ></textarea>
          </mat-form-field>
        </section>

        <section class="identidade">
          <h2>Como te chamamos?</h2>

          <mat-form-field appearance="outline">
            <mat-label>Seu nome</mat-label>
            <input matInput formControlName="nome" autocomplete="name" required />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>WhatsApp</mat-label>
            <mat-icon matIconPrefix>chat</mat-icon>
            <input
              matInput
              type="tel"
              formControlName="whatsapp"
              autocomplete="tel"
              placeholder="(11) 99999-9999"
              [readonly]="whatsappLocked()"
              required
            />
            @if (whatsappLocked()) {
              <mat-hint>Trocar via botão "Trocar WhatsApp" no topo</mat-hint>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Instagram (opcional)</mat-label>
            <span matTextPrefix>&#64;</span>
            <input matInput formControlName="instagram" autocomplete="off" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Email (opcional)</mat-label>
            <mat-icon matIconPrefix>mail</mat-icon>
            <input matInput type="email" formControlName="email" autocomplete="email" />
          </mat-form-field>
        </section>

        @if (error(); as message) {
          <p role="alert" class="error">{{ message }}</p>
        }

        <button
          mat-flat-button
          color="primary"
          type="submit"
          [disabled]="form.invalid || submitting()"
        >
          <mat-icon>arrow_forward</mat-icon>
          <span>Continuar para RustDesk</span>
        </button>
      </form>
    </div>
  `,
  styleUrl: './conexao-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConexaoForm {
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly preFill = input<ClienteLookupResult | null>(null);
  readonly servicos = input<ReadonlyArray<Servico>>([]);
  readonly drafted = output<ConexaoFormData>();
  readonly back = output<void>();
  readonly backToVitrine = output<void>();

  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly whatsappLocked = computed(() => this.preFill() !== null);

  protected readonly form = this.fb.group({
    descricao_solicitacao: [''],
    nome: ['', [Validators.required, Validators.minLength(2)]],
    whatsapp: ['', [Validators.required, Validators.minLength(10)]],
    instagram: [''],
    email: ['', [Validators.email]],
  });

  constructor() {
    effect(() => {
      const pre = this.preFill();
      if (!pre) return;
      this.form.patchValue(
        {
          whatsapp: pre.whatsapp,
          nome: pre.nome ?? '',
          instagram: pre.instagram ?? '',
          email: pre.email ?? '',
        },
        { emitEvent: false },
      );
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;

    this.error.set(null);

    const value = this.form.getRawValue();
    const data: ConexaoFormData = {
      nome: value.nome.trim(),
      whatsapp: value.whatsapp.trim(),
      instagram: value.instagram.trim() || null,
      email: value.email.trim() || null,
      servico_id: this.servicos()[0]?.id ?? null,
      servico_ids: this.servicos().map((servico) => servico.id),
      descricao_solicitacao: value.descricao_solicitacao.trim() || null,
    };

    this.drafted.emit(data);
  }
}
