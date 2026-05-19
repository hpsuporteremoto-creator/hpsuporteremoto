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
import { AtendimentoService } from '../atendimento.service';
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
        <button
          mat-button
          type="button"
          class="back-btn"
          (click)="backToVitrine.emit()"
        >
          <mat-icon>arrow_back</mat-icon>
          <span>Trocar serviço</span>
        </button>
        <button
          mat-button
          type="button"
          class="back-btn"
          (click)="back.emit()"
        >
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
            Confirme/atualize seus dados e descreva o problema que você
            precisa de ajuda.
          </p>
        } @else {
          <mat-icon class="monitor">desktop_windows</mat-icon>
          <h1>Solicitar atendimento</h1>
          <p class="hint">
            Compartilhe o ID do RustDesk e a senha temporária pra começarmos o
            suporte. Mantenha o RustDesk aberto.
          </p>
        }
      </header>

      @if (loading()) {
        <mat-progress-bar mode="indeterminate" />
      }

      @if (servico(); as s) {
        <section class="servico-resumo">
          <h2>Serviço escolhido</h2>
          <div class="servico-pill">
            <mat-icon>design_services</mat-icon>
            <span class="servico-nome">{{ s.nome }}</span>
            <span class="servico-valor">{{ s.valor_centavos / 100 | currency }}</span>
          </div>
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
            <input
              matInput
              type="email"
              formControlName="email"
              autocomplete="email"
            />
          </mat-form-field>
        </section>

        <section class="rustdesk">
          <h2>Credenciais do RustDesk</h2>

          <mat-form-field appearance="outline">
            <mat-label>ID do RustDesk</mat-label>
            <mat-icon matIconPrefix>desktop_windows</mat-icon>
            <input
              matInput
              formControlName="rustdesk_id"
              inputmode="numeric"
              required
            />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Senha temporária do RustDesk</mat-label>
            <mat-icon matIconPrefix>key</mat-icon>
            <input
              matInput
              type="text"
              formControlName="rustdesk_password"
              required
            />
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
          <mat-icon>send</mat-icon>
          <span>{{ submitting() ? 'Enviando…' : 'Iniciar atendimento' }}</span>
        </button>
      </form>
    </div>
  `,
  styleUrl: './conexao-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConexaoForm {
  private readonly svc = inject(AtendimentoService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly preFill = input<ClienteLookupResult | null>(null);
  readonly servico = input<Servico | null>(null);
  readonly created = output<string>();
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
    rustdesk_id: ['', [Validators.required, Validators.minLength(6)]],
    rustdesk_password: ['', [Validators.required, Validators.minLength(4)]],
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

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;

    this.submitting.set(true);
    this.error.set(null);

    const value = this.form.getRawValue();
    const data: ConexaoFormData = {
      nome: value.nome.trim(),
      whatsapp: value.whatsapp.trim(),
      instagram: value.instagram.trim() || null,
      email: value.email.trim() || null,
      rustdesk_id: value.rustdesk_id.trim(),
      rustdesk_password: value.rustdesk_password.trim(),
      servico_id: this.servico()?.id ?? null,
      descricao_solicitacao: value.descricao_solicitacao.trim() || null,
    };

    try {
      const id = await this.svc.criar(data);
      this.created.emit(id);
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Erro ao criar atendimento',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
