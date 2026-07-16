import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, Location } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { formatWhatsappDisplay } from '../../../../shared/whatsapp.util';
import { MarketingService } from '../marketing.service';
import { MarketingCampaign, MarketingOverview } from '../marketing.types';

@Component({
  selector: 'hp-marketing-list',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  template: `
    <mat-toolbar color="primary">
      <button mat-icon-button type="button" (click)="voltar()" aria-label="Voltar">
        <mat-icon>arrow_back</mat-icon>
      </button>
      <span>Marketing</span>
      <span class="spacer"></span>
      <a mat-flat-button color="primary" routerLink="nova">
        <mat-icon>campaign</mat-icon>
        <span>Nova campanha</span>
      </a>
    </mat-toolbar>

    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="marketing">
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }

      @if (overview(); as data) {
        <section class="hero" aria-labelledby="marketing-title">
          <div>
            <h1 id="marketing-title">Campanhas por email</h1>
            <p>Envie comunicações comerciais para a base que autorizou o contato.</p>
          </div>
          <div class="sender">
            <mat-icon>outgoing_mail</mat-icon>
            <span>{{ data.remetente }}</span>
          </div>
        </section>

        @if (!data.resendConfigurado) {
          <p class="warning" role="status">
            <mat-icon>key_off</mat-icon>
            A chave do Resend ainda não está configurada no Cloudflare Pages.
          </p>
        }

        <section class="metrics" aria-label="Resumo da base comercial">
          <mat-card appearance="filled" class="metric-card">
            <mat-card-content>
              <mat-icon>mail</mat-icon>
              <span>
                <strong>{{ data.totalEmails }}</strong>
                <small>emails aptos</small>
              </span>
            </mat-card-content>
          </mat-card>
          <mat-card appearance="filled" class="metric-card">
            <mat-card-content>
              <mat-icon>chat</mat-icon>
              <span>
                <strong>{{ data.totalWhatsapps }}</strong>
                <small>WhatsApps cadastrados</small>
              </span>
            </mat-card-content>
          </mat-card>
          <mat-card appearance="filled" class="metric-card">
            <mat-card-content>
              <mat-icon>history</mat-icon>
              <span>
                <strong>{{ data.campanhas.length }}</strong>
                <small>campanhas registradas</small>
              </span>
            </mat-card-content>
          </mat-card>
        </section>

        <section class="section-head">
          <div>
            <h2>Contatos comerciais</h2>
            <p>{{ contactCount() }} cliente(s) com email autorizado.</p>
          </div>
          <div class="section-actions">
            <button mat-stroked-button type="button" (click)="download('emails')" [disabled]="downloading()">
              <mat-icon>download</mat-icon>
              <span>Emails</span>
            </button>
            <button mat-stroked-button type="button" (click)="download('whatsapps')" [disabled]="downloading()">
              <mat-icon>download</mat-icon>
              <span>Celulares</span>
            </button>
          </div>
        </section>

        @if (data.destinatarios.length === 0) {
          <p class="empty">Não há contatos comerciais disponíveis.</p>
        } @else {
          <section class="contacts" aria-label="Lista de contatos comerciais">
            <div class="contact-row contact-head" aria-hidden="true">
              <span>Cliente</span>
              <span>Email</span>
              <span>WhatsApp</span>
            </div>
            @for (contact of data.destinatarios; track contact.id) {
              <div class="contact-row">
                <strong>{{ contact.nome }}</strong>
                <a [href]="'mailto:' + contact.email">{{ contact.email }}</a>
                @if (contact.whatsapp) {
                  <a
                    [href]="'https://wa.me/' + contact.whatsapp"
                    target="_blank"
                    rel="noopener"
                  >
                    {{ formatWhatsapp(contact.whatsapp) }}
                  </a>
                } @else {
                  <span>Sem WhatsApp</span>
                }
              </div>
            }
          </section>
        }

        <section class="section-head campaigns-head">
          <div>
            <h2>Histórico de campanhas</h2>
            <p>Envios, agendamentos e falhas ficam registrados aqui.</p>
          </div>
        </section>

        @if (data.campanhas.length === 0) {
          <p class="empty">Nenhuma campanha enviada ainda.</p>
        } @else {
          <section class="campaigns" aria-label="Histórico de campanhas">
            @for (campaign of data.campanhas; track campaign.id) {
              <mat-card appearance="filled" class="campaign-card">
                <mat-card-content>
                  <div class="campaign-main">
                    <strong>{{ campaign.nome }}</strong>
                    <span>{{ campaign.assunto }}</span>
                    <small>
                      {{ campaign.total_destinatarios }} destinatário(s)
                      @if (campaign.servico; as service) {
                        · Compradores de {{ service.nome }}
                      }
                    </small>
                    @if (campaign.erro) {
                      <small class="campaign-error">{{ campaign.erro }}</small>
                    }
                  </div>
                  <div class="campaign-meta">
                    <span class="status status-{{ campaign.status }}">{{ statusLabel(campaign) }}</span>
                    <small>{{ campaignDate(campaign) | date: 'short' }}</small>
                    @if (campaign.status === 'enviada') {
                      <a
                        mat-stroked-button
                        [routerLink]="[campaign.id, 'reenviar']"
                        [attr.aria-label]="'Editar e reenviar ' + campaign.nome"
                      >
                        <mat-icon>edit</mat-icon>
                        <span>Editar e reenviar</span>
                      </a>
                    }
                  </div>
                </mat-card-content>
              </mat-card>
            }
          </section>
        }
      } @else if (!loading()) {
        <p class="empty">Não foi possível carregar o módulo de marketing.</p>
      }
    </main>
  `,
  styleUrl: './marketing-list.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingListPage {
  private readonly marketingService = inject(MarketingService);
  private readonly location = inject(Location);

  protected readonly overview = signal<MarketingOverview | null>(null);
  protected readonly loading = signal(false);
  protected readonly downloading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly contactCount = computed(() => this.overview()?.destinatarios.length ?? 0);
  protected readonly formatWhatsapp = formatWhatsappDisplay;

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
      this.overview.set(await this.marketingService.overview());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar marketing');
    } finally {
      this.loading.set(false);
    }
  }

  async download(field: 'emails' | 'whatsapps'): Promise<void> {
    this.downloading.set(true);
    this.error.set(null);
    try {
      await this.marketingService.download(field);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao exportar contatos');
    } finally {
      this.downloading.set(false);
    }
  }

  protected statusLabel(campaign: MarketingCampaign): string {
    const labels: Readonly<Record<MarketingCampaign['status'], string>> = {
      rascunho: 'Rascunho',
      agendada: 'Agendada',
      enviada: 'Enviada',
      falhou: 'Falhou',
      cancelada: 'Cancelada',
    };
    return labels[campaign.status];
  }

  protected campaignDate(campaign: MarketingCampaign): string {
    return campaign.agendada_para ?? campaign.enviada_em ?? campaign.created_at;
  }
}
