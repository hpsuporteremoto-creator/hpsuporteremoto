import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { MaskitoDirective } from '@maskito/angular';
import type { MaskitoOptions } from '@maskito/core';
import { ClientesService } from '../clientes.service';
import { ClienteFormData } from '../clientes.types';
import {
  extractWhatsappParts,
  formatWhatsappLocal,
  onlyDigits,
  parseWhatsappCanonical,
} from '../../../../shared/whatsapp.util';

@Component({
  selector: 'hp-cliente-form',
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
    MaskitoDirective,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>{{ isNew() ? 'Novo cliente' : 'Editar cliente' }}</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="content">
      <mat-card appearance="filled">
        <mat-card-content class="card-content">
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline">
              <mat-label>Nome</mat-label>
              <input matInput formControlName="nome" required />
              @if (form.controls.nome.hasError('required')) {
                <mat-error>Nome é obrigatório</mat-error>
              }
            </mat-form-field>

            <div class="whatsapp-row">
              <mat-form-field appearance="outline" class="ddi">
                <mat-label>DDI</mat-label>
                <span matTextPrefix>+</span>
                <input
                  matInput
                  type="tel"
                  inputmode="numeric"
                  autocomplete="tel-country-code"
                  formControlName="ddi"
                  [maskito]="ddiMask"
                  (input)="onDdiInput($event)"
                  required
                />
                @if (form.controls.ddi.hasError('required')) {
                  <mat-error>DDI é obrigatório</mat-error>
                } @else if (form.controls.ddi.hasError('pattern')) {
                  <mat-error>Informe de 1 a 3 dígitos</mat-error>
                }
              </mat-form-field>

              <mat-form-field appearance="outline" class="local">
                <mat-label>WhatsApp</mat-label>
                <mat-icon matIconPrefix>chat</mat-icon>
                <input
                  matInput
                  type="tel"
                  inputmode="tel"
                  autocomplete="tel"
                  formControlName="whatsappLocal"
                  placeholder="+55 (81) 98520-7465"
                  [maskito]="whatsappMask"
                  (input)="onWhatsappInput($event)"
                  required
                />
                <mat-hint>Pode colar o telefone completo com DDI.</mat-hint>
                @if (form.controls.whatsappLocal.hasError('required')) {
                  <mat-error>WhatsApp é obrigatório</mat-error>
                } @else if (
                  form.controls.whatsappLocal.hasError('minlength') ||
                  form.controls.whatsappLocal.hasError('maxlength') ||
                  form.controls.whatsappLocal.hasError('pattern')
                ) {
                  <mat-error>Use apenas dígitos, espaços, parênteses ou traços.</mat-error>
                }
              </mat-form-field>
            </div>

            <mat-form-field appearance="outline">
              <mat-label>Instagram (opcional)</mat-label>
              <span matTextPrefix>&#64;</span>
              <input matInput formControlName="instagram" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Email (opcional)</mat-label>
              <mat-icon matIconPrefix>mail</mat-icon>
              <input matInput type="email" formControlName="email" />
              @if (form.controls.email.hasError('email')) {
                <mat-error>Email inválido</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Observação</mat-label>
              <textarea
                matInput
                formControlName="observacao"
                rows="4"
                placeholder="Preferências, contexto do cliente ou detalhes importantes"
              ></textarea>
            </mat-form-field>

            <mat-slide-toggle formControlName="ativo">Cliente ativo</mat-slide-toggle>
            <mat-slide-toggle formControlName="marketing_opt_in">
              Autoriza comunicações comerciais por email
            </mat-slide-toggle>

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
  styleUrl: './cliente-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClienteFormPage {
  private readonly svc = inject(ClientesService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly id = signal<string | null>(null);
  protected readonly isNew = computed(() => this.id() === null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  private readonly returnUrl = signal<string | null>(null);

  protected readonly ddiMask: MaskitoOptions = { mask: /^\d{0,3}$/ };
  protected readonly whatsappMask: MaskitoOptions = {
    mask: /^[\d\s()+-]{0,28}$/,
  };
  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    ddi: ['55', [Validators.required, Validators.pattern(/^\d{1,3}$/)]],
    whatsappLocal: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[\d\s()+-]+$/),
        Validators.minLength(8),
        Validators.maxLength(28),
      ],
    ],
    instagram: [''],
    email: ['', [Validators.email]],
    observacao: [''],
    marketing_opt_in: [true],
    ativo: [true],
  });

  constructor() {
    this.returnUrl.set(normalizeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.id.set(idParam);
      void this.carregar(idParam);
    }
  }

  voltar(): void {
    const returnUrl = this.returnUrl();
    if (returnUrl) {
      void this.router.navigateByUrl(returnUrl);
      return;
    }
    this.location.back();
  }

  async carregar(id: string): Promise<void> {
    this.loading.set(true);
    try {
      const cliente = await this.svc.get(id);
      if (!cliente) {
        this.snackBar.open('Cliente não encontrado', 'OK', { duration: 4000 });
        this.router.navigate(['/admin/clientes']);
        return;
      }
      const { ddi, local } = parseWhatsappCanonical(cliente.whatsapp);
      this.form.setValue({
        nome: cliente.nome,
        ddi,
        whatsappLocal: formatWhatsappLocal(local, ddi),
        instagram: cliente.instagram ?? '',
        email: cliente.email ?? '',
        observacao: cliente.observacao ?? '',
        marketing_opt_in: cliente.marketing_opt_in,
        ativo: cliente.ativo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);

    const value = this.form.getRawValue();
    const whatsapp = `${onlyDigits(value.ddi)}${onlyDigits(value.whatsappLocal)}`;
    if (whatsapp.length < 10 || whatsapp.length > 15) {
      this.snackBar.open(
        'WhatsApp inválido: precisa de 10 a 15 dígitos no total (DDI + número).',
        'OK',
        { duration: 4000 },
      );
      this.saving.set(false);
      return;
    }
    const data: ClienteFormData = {
      nome: value.nome.trim(),
      whatsapp,
      instagram: value.instagram.trim() || null,
      email: value.email.trim() || null,
      observacao: value.observacao.trim() || null,
      marketing_opt_in: value.marketing_opt_in,
      ativo: value.ativo,
    };

    try {
      const id = this.id();
      if (id) {
        await this.svc.update(id, data);
        this.snackBar.open('Cliente atualizado', 'OK', { duration: 3000 });
        const returnUrl = this.returnUrl();
        if (returnUrl) {
          await this.router.navigateByUrl(returnUrl);
        } else {
          await this.router.navigate(['/admin/clientes']);
        }
      } else {
        const novo = await this.svc.create(data);
        this.snackBar.open('Cliente criado', 'OK', { duration: 3000 });
        this.router.navigate(['/admin/atendimentos'], {
          queryParams: { clienteId: novo.id, clienteNome: novo.nome },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.saving.set(false);
    }
  }

  onDdiInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const ddi = onlyDigits(input?.value ?? '').slice(0, 3);
    this.setValue('ddi', ddi);
    this.reformatWhatsappLocal(ddi);
  }

  onWhatsappInput(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const raw = input?.value ?? '';
    const currentDdi = this.form.controls.ddi.value;
    const parts = extractWhatsappParts(raw, currentDdi);
    const formatted = formatWhatsappLocal(parts.local, parts.ddi);

    this.setValue('ddi', parts.ddi);
    this.setValue('whatsappLocal', formatted);
    if (input && input.value !== formatted) {
      input.value = formatted;
    }
  }

  private reformatWhatsappLocal(ddi: string): void {
    const current = this.form.controls.whatsappLocal.value;
    const formatted = formatWhatsappLocal(current, ddi);
    this.setValue('whatsappLocal', formatted);
  }

  private setValue(control: 'ddi' | 'whatsappLocal', value: string): void {
    const formControl = this.form.controls[control];
    if (formControl.value !== value) {
      formControl.setValue(value, { emitEvent: false });
    }
  }
}

function normalizeReturnUrl(value: string | null): string | null {
  return value?.startsWith('/admin/') ? value : null;
}
