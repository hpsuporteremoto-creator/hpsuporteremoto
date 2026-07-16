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
import { MatSelectChange, MatSelectModule } from '@angular/material/select';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ServicoDescriptionEditorComponent } from '../../servicos/components/servico-description-editor';
import { ServicosService } from '../../servicos/servicos.service';
import { Servico } from '../../servicos/servicos.types';
import { MarketingService } from '../marketing.service';
import { MarketingAudience, MarketingCampaignInput } from '../marketing.types';

@Component({
  selector: 'hp-marketing-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatToolbarModule,
    ServicoDescriptionEditorComponent,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>{{ isResend() ? 'Editar e reenviar' : 'Nova campanha' }}</span>
    </mat-toolbar>

    @if (loading() || saving()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="campaign-page">
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      @if (isResend()) {
        <p class="resend-notice" role="status">
          <mat-icon>history</mat-icon>
          <span>O envio original será preservado. Ao enviar, uma nova campanha será criada.</span>
        </p>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" class="campaign-form">
        <section class="form-section" aria-labelledby="audience-title">
          <div class="section-title">
            <span class="section-index">1</span>
            <div>
              <h1 id="audience-title">Público</h1>
              <p>Defina os clientes que receberão a campanha.</p>
            </div>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>Segmento</mat-label>
            <mat-select formControlName="servico_id" (selectionChange)="onServicoChange($event)">
              <mat-option value="">Todos os clientes com email autorizado</mat-option>
              @for (servico of servicos(); track servico.id) {
                <mat-option [value]="servico.id">
                  {{ servico.nome }}
                  @if (servico.categoria; as categoria) {
                    · {{ categoria.nome }}
                  }
                </mat-option>
              }
            </mat-select>
          </mat-form-field>

          @if (form.controls.servico_id.value) {
            <mat-slide-toggle
              formControlName="somente_vendas_contabilizadas"
              (change)="onContabilizadoChange($event)"
            >
              Apenas vendas contabilizadas
            </mat-slide-toggle>
          }

          <div class="audience-summary" aria-live="polite">
            <mat-icon>groups</mat-icon>
            <div>
              <strong>{{ audience()?.total ?? 0 }} destinatário(s)</strong>
              <span>{{ audience()?.totalWhatsapps ?? 0 }} WhatsApp(s) vinculados</span>
            </div>
          </div>

          @if (audiencePreview().length > 0) {
            <div class="audience-preview" aria-label="Prévia do público">
              @for (recipient of audiencePreview(); track recipient.id) {
                <div>
                  <strong>{{ recipient.nome }}</strong>
                  <span>{{ recipient.email }}</span>
                </div>
              }
              @if ((audience()?.total ?? 0) > audiencePreview().length) {
                <small>e mais {{ (audience()?.total ?? 0) - audiencePreview().length }} contato(s)</small>
              }
            </div>
          }
        </section>

        <section class="form-section" aria-labelledby="message-title">
          <div class="section-title">
            <span class="section-index">2</span>
            <div>
              <h2 id="message-title">Mensagem</h2>
              <p>Escreva a campanha que será enviada pelo remetente HP Suporte.</p>
            </div>
          </div>

          <div class="form-grid">
            <mat-form-field appearance="outline">
              <mat-label>Nome interno da campanha</mat-label>
              <input matInput formControlName="nome" maxlength="120" required />
              @if (form.controls.nome.invalid && form.controls.nome.touched) {
                <mat-error>Informe pelo menos 3 caracteres.</mat-error>
              }
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Assunto do email</mat-label>
              <input matInput formControlName="assunto" maxlength="180" required />
              @if (form.controls.assunto.invalid && form.controls.assunto.touched) {
                <mat-error>Informe pelo menos 3 caracteres.</mat-error>
              }
            </mat-form-field>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>Texto de prévia</mat-label>
            <input matInput formControlName="texto_previa" maxlength="180" />
          </mat-form-field>

          <hp-servico-description-editor
            formControlName="mensagem"
            label="Mensagem do email"
            helperText="Linhas em branco viram blocos no email. O link de descadastro é incluído automaticamente."
            errorText="A mensagem precisa ter pelo menos 3 caracteres."
            [invalid]="form.controls.mensagem.invalid && form.controls.mensagem.touched"
          />
        </section>

        <section class="form-section" aria-labelledby="send-title">
          <div class="section-title">
            <span class="section-index">3</span>
            <div>
              <h2 id="send-title">Envio</h2>
              <p>Envie agora, faça um teste ou programe uma data.</p>
            </div>
          </div>

          <div class="send-grid">
            <mat-form-field appearance="outline">
              <mat-label>Agendar para</mat-label>
              <input matInput type="datetime-local" formControlName="agendada_para" />
              <mat-hint>Deixe em branco para enviar agora.</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Email para teste</mat-label>
              <input matInput type="email" formControlName="email_teste" />
              @if (form.controls.email_teste.hasError('email')) {
                <mat-error>Email inválido.</mat-error>
              }
            </mat-form-field>
          </div>

          <div class="actions">
            <button
              mat-stroked-button
              type="button"
              (click)="sendTest()"
              [disabled]="saving() || form.controls.email_teste.invalid || !form.controls.email_teste.value || !canTest()"
            >
              <mat-icon>send</mat-icon>
              <span>Enviar teste</span>
            </button>
            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="saving() || form.invalid || (audience()?.total ?? 0) === 0"
            >
              <mat-icon>{{ hasSchedule() ? 'schedule_send' : 'campaign' }}</mat-icon>
              <span>{{ hasSchedule() ? 'Agendar campanha' : 'Enviar campanha' }}</span>
            </button>
          </div>
        </section>
      </form>
    </main>
  `,
  styleUrl: './marketing-form.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingFormPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly marketingService = inject(MarketingService);
  private readonly servicosService = inject(ServicosService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly campaignId = this.route.snapshot.paramMap.get('id');

  protected readonly servicos = signal<Servico[]>([]);
  protected readonly audience = signal<MarketingAudience | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly isResend = signal(Boolean(this.campaignId));
  protected readonly audiencePreview = computed(() => this.audience()?.destinatarios.slice(0, 5) ?? []);
  protected readonly hasSchedule = computed(() => this.form.controls.agendada_para.value.length > 0);
  protected readonly canTest = computed(
    () => this.form.controls.assunto.valid && this.form.controls.mensagem.valid,
  );

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    assunto: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(180)]],
    texto_previa: ['', [Validators.maxLength(180)]],
    mensagem: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(20_000)]],
    servico_id: [''],
    somente_vendas_contabilizadas: [true],
    agendada_para: [''],
    email_teste: ['', [Validators.email]],
  });

  constructor() {
    void this.load();
  }

  voltar(): void {
    this.location.back();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [servicos, campaign] = await Promise.all([
        this.servicosService.list(),
        this.campaignId ? this.marketingService.getCampaign(this.campaignId) : Promise.resolve(null),
      ]);
      this.servicos.set(servicos);
      if (campaign) {
        this.form.patchValue({
          nome: this.resendName(campaign.nome),
          assunto: campaign.assunto,
          texto_previa: campaign.texto_previa ?? '',
          mensagem: campaign.mensagem,
          servico_id: campaign.servico_id ?? '',
          somente_vendas_contabilizadas: campaign.somente_vendas_contabilizadas,
          agendada_para: '',
          email_teste: '',
        });
      }
      const servicoId = campaign?.servico_id ?? null;
      const somenteContabilizados = campaign?.somente_vendas_contabilizadas ?? true;
      this.audience.set(await this.marketingService.audience(servicoId, somenteContabilizados));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar campanha');
    } finally {
      this.loading.set(false);
    }
  }

  onServicoChange(event: MatSelectChange): void {
    const servicoId = typeof event.value === 'string' && event.value.length > 0 ? event.value : null;
    void this.loadAudience(servicoId, this.form.controls.somente_vendas_contabilizadas.value);
  }

  onContabilizadoChange(event: MatSlideToggleChange): void {
    const servicoId = this.form.controls.servico_id.value || null;
    void this.loadAudience(servicoId, event.checked);
  }

  async sendTest(): Promise<void> {
    const value = this.form.getRawValue();
    if (!value.email_teste || !this.canTest()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.marketingService.sendTest(value.email_teste, value.assunto, value.mensagem);
      this.snackBar.open('Email de teste enviado.', 'OK', { duration: 3000 });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao enviar teste');
    } finally {
      this.saving.set(false);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid || (this.audience()?.total ?? 0) === 0) return;
    this.saving.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    const input: MarketingCampaignInput = {
      nome: value.nome.trim(),
      assunto: value.assunto.trim(),
      mensagem: value.mensagem.trim(),
      texto_previa: value.texto_previa.trim() || null,
      servico_id: value.servico_id || null,
      somente_vendas_contabilizadas: value.somente_vendas_contabilizadas,
      agendada_para: value.agendada_para || null,
    };
    try {
      const campaign = await this.marketingService.create(input);
      this.snackBar.open(
        campaign.status === 'agendada'
          ? 'Campanha agendada.'
          : this.isResend()
            ? 'Campanha reenviada.'
            : 'Campanha enviada.',
        'OK',
        { duration: 4000 },
      );
      await this.router.navigate(['/admin/marketing']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao criar campanha');
    } finally {
      this.saving.set(false);
    }
  }

  private async loadAudience(
    servicoId: string | null,
    somenteContabilizados: boolean,
  ): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.audience.set(await this.marketingService.audience(servicoId, somenteContabilizados));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar público');
    } finally {
      this.loading.set(false);
    }
  }

  private resendName(name: string): string {
    const suffix = ' - reenvio';
    return `${name.slice(0, 120 - suffix.length)}${suffix}`;
  }
}
