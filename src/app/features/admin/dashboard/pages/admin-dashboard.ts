import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { AuthService } from '../../../../core/auth/auth.service';
import { ATENDIMENTO_STATE_LABEL, AtendimentoState } from '../../atendimentos/atendimentos.types';
import { AdminExportacaoService } from '../../exportacao/exportacao.service';
import { DashboardService } from '../dashboard.service';
import { AdminDashboardData, DashboardTodayAtendimento } from '../dashboard.types';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

interface DashboardKpi {
  readonly label: string;
  readonly value: string;
  readonly helper: string;
  readonly icon: string;
  readonly tone: 'primary' | 'warning' | 'success' | 'neutral';
  readonly route?: string;
  readonly queryParams?: Readonly<Record<string, string>>;
}

function todayISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Component({
  selector: 'hp-admin-dashboard',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    NgxEchartsDirective,
  ],
  providers: [provideEchartsCore({ echarts })],
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }

    <main class="dashboard">
      <section class="hero">
        <div>
          <h1>Dashboard</h1>
          <p>Visão operacional dos atendimentos, cobrança e capacidade ativa.</p>
        </div>
        <div class="hero-actions">
          <button mat-stroked-button type="button" (click)="carregar()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            <span>Atualizar</span>
          </button>
          @if (auth.isAdmin()) {
            <button
              mat-stroked-button
              type="button"
              (click)="exportarExcel()"
              [disabled]="exporting()"
            >
              <mat-icon>{{ exporting() ? 'hourglass_top' : 'download' }}</mat-icon>
              <span>{{ exporting() ? 'Exportando...' : 'Exportar Excel' }}</span>
            </button>
          }
          <a mat-flat-button color="primary" routerLink="clientes">
            <mat-icon>person_search</mat-icon>
            <span>Novo pedido</span>
          </a>
        </div>
      </section>

      @if (error(); as msg) {
        <p class="error" role="alert">{{ msg }}</p>
      }

      @if (data(); as dashboard) {
        <section class="kpi-grid" aria-label="Indicadores principais">
          @for (kpi of kpis(); track kpi.label) {
            <mat-card class="kpi-card tone-{{ kpi.tone }}" appearance="filled">
              @if (kpi.route) {
                <a [routerLink]="kpi.route" [queryParams]="kpi.queryParams" class="kpi-link">
                  <ng-container
                    [ngTemplateOutlet]="kpiContent"
                    [ngTemplateOutletContext]="{ kpi }"
                  />
                </a>
              } @else {
                <ng-container [ngTemplateOutlet]="kpiContent" [ngTemplateOutletContext]="{ kpi }" />
              }
            </mat-card>
          }
        </section>

        <ng-template #kpiContent let-kpi="kpi">
          <mat-card-content class="kpi-content">
            <span class="kpi-icon">
              <mat-icon>{{ kpi.icon }}</mat-icon>
            </span>
            <span class="kpi-copy">
              <small>{{ kpi.label }}</small>
              <strong>{{ kpi.value }}</strong>
              <span>{{ kpi.helper }}</span>
            </span>
          </mat-card-content>
        </ng-template>

        <section class="today-area" aria-labelledby="pedidos-hoje-title">
          <mat-card appearance="filled" class="today-card">
            <mat-card-header>
              <mat-card-title id="pedidos-hoje-title">Pedidos criados hoje</mat-card-title>
              <mat-card-subtitle>
                {{ pedidosHojeResumo(dashboard.atendimentosHoje.length) }}
              </mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @if (dashboard.atendimentosHoje.length === 0) {
                <p class="today-empty">Nenhum pedido criado hoje.</p>
              } @else {
                <div class="today-list">
                  @for (atendimento of dashboard.atendimentosHoje; track atendimento.id) {
                    <a
                      class="today-item"
                      [routerLink]="['atendimentos', atendimento.id]"
                      [attr.aria-label]="pedidoHojeLabel(atendimento)"
                    >
                      <span class="today-main">
                        <strong class="today-client">{{ atendimento.clienteNome }}</strong>
                        @if (atendimento.servicos.length > 0) {
                          <ul class="today-services" aria-label="Itens do pedido">
                            @for (servico of atendimento.servicos; track servico.id) {
                              <li>
                                <span class="today-service-name">
                                  @if (servico.quantidade > 1) {
                                    <strong>{{ servico.quantidade }}x</strong>
                                  }
                                  {{ servico.nome }}
                                </span>
                                <span class="today-service-value">
                                  {{ formatCurrency(servico.subtotal_centavos) }}
                                </span>
                              </li>
                            }
                          </ul>
                        } @else {
                          <span class="today-description">
                            {{ atendimento.descricaoSolicitacao || 'Sem serviços vinculados' }}
                          </span>
                        }
                        @if (atendimento.descontoCentavos > 0) {
                          <span class="today-discount">
                            Desconto -{{ formatCurrency(atendimento.descontoCentavos) }}
                          </span>
                        }
                        @if (atendimento.acrescimoCentavos > 0) {
                          <span class="today-surcharge">
                            Acréscimo +{{ formatCurrency(atendimento.acrescimoCentavos) }}
                          </span>
                        }
                      </span>
                      <span class="today-meta">
                        <strong class="today-value">
                          {{ formatCurrency(atendimento.valorCentavos) }}
                        </strong>
                        <span>{{ atendimento.createdAt | date: 'shortTime' }}</span>
                        <span class="today-state state-{{ atendimento.state }}">
                          {{ stateLabel(atendimento.state) }}
                        </span>
                      </span>
                    </a>
                  }
                </div>
              }
            </mat-card-content>
          </mat-card>
        </section>

        <section class="charts">
          <mat-card appearance="filled" class="chart-card wide">
            <mat-card-header>
              <mat-card-title>Receita e atendimentos</mat-card-title>
              <mat-card-subtitle>Últimos 30 dias</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div echarts [options]="revenueChartOptions()" class="chart"></div>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="filled" class="chart-card">
            <mat-card-header>
              <mat-card-title>Fila por status</mat-card-title>
              <mat-card-subtitle>Distribuição atual</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div echarts [options]="statusChartOptions()" class="chart"></div>
            </mat-card-content>
          </mat-card>
        </section>
      } @else if (!loading()) {
        <p class="empty">Não foi possível carregar o dashboard.</p>
      }
    </main>
  `,
  styleUrl: './admin-dashboard.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardPage {
  protected readonly auth = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);
  private readonly exportacaoService = inject(AdminExportacaoService);
  private readonly currencyFormatter = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  private readonly numberFormatter = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0,
  });

  protected readonly data = signal<AdminDashboardData | null>(null);
  protected readonly loading = signal(false);
  protected readonly exporting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly kpis = computed<DashboardKpi[]>(() => {
    const data = this.data();
    if (!data) return [];
    const emAndamento = data.stateCounts.find((item) => item.state === 'em_andamento')?.count ?? 0;
    const pagamento = data.stateCounts.find((item) => item.state === 'pagamento')?.count ?? 0;
    const hoje = todayISO();

    const items: DashboardKpi[] = [
      {
        label: 'Hoje',
        value: this.formatCurrency(data.receitaHojeCentavos),
        helper: 'faturamento do dia',
        icon: 'today',
        tone: 'success',
        route: 'financeiro',
        queryParams: { from: hoje, to: hoje },
      },
      {
        label: 'Em andamento',
        value: this.formatNumber(emAndamento),
        helper: 'serviços em execução',
        icon: 'support_agent',
        tone: 'primary',
        route: 'atendimentos',
        queryParams: { filter: 'em_andamento' },
      },
      {
        label: 'Pagamento',
        value: this.formatNumber(pagamento),
        helper: 'aguardando confirmação',
        icon: 'qr_code_2',
        tone: 'warning',
        route: 'atendimentos',
        queryParams: { filter: 'pagamento' },
      },
      {
        label: 'Receita do mês',
        value: this.formatCurrency(data.receitaMesCentavos),
        helper: 'entradas registradas',
        icon: 'trending_up',
        tone: 'success',
        route: 'financeiro',
      },
      {
        label: 'Clientes ativos',
        value: this.formatNumber(data.clientesAtivos),
        helper: 'base habilitada',
        icon: 'groups',
        tone: 'neutral',
        route: 'clientes',
      },
      {
        label: 'Serviços ativos',
        value: this.formatNumber(data.servicosAtivos),
        helper: 'catálogo disponível',
        icon: 'design_services',
        tone: 'neutral',
        route: 'servicos',
      },
    ];
    return items;
  });

  protected readonly revenueChartOptions = computed<EChartsCoreOption>(() => {
    const daily = this.data()?.daily ?? [];
    return {
      color: ['#5ecb8b', '#ffb511', '#64b5f6'],
      tooltip: {
        trigger: 'axis',
      },
      legend: {
        bottom: 0,
        textStyle: { color: '#b3b3b3' },
      },
      grid: {
        left: 12,
        right: 16,
        top: 28,
        bottom: 48,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: daily.map((day) => day.label),
        axisLabel: { color: '#b3b3b3' },
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
      },
      yAxis: [
        {
          type: 'value',
          axisLabel: { color: '#b3b3b3' },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
        },
        {
          type: 'value',
          axisLabel: { color: '#b3b3b3' },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: 'Entradas',
          type: 'bar',
          data: daily.map((day) => day.entradasCentavos / 100),
          barMaxWidth: 18,
          yAxisIndex: 0,
          tooltip: {
            valueFormatter: (value: unknown) =>
              typeof value === 'number' ? this.formatCurrency(value * 100) : String(value),
          },
        },
        {
          name: 'Saldo',
          type: 'line',
          smooth: true,
          data: daily.map((day) => day.saldoCentavos / 100),
          yAxisIndex: 0,
          tooltip: {
            valueFormatter: (value: unknown) =>
              typeof value === 'number' ? this.formatCurrency(value * 100) : String(value),
          },
        },
        {
          name: 'Atendimentos',
          type: 'line',
          smooth: true,
          data: daily.map((day) => day.atendimentos),
          yAxisIndex: 1,
        },
      ],
    };
  });

  protected readonly statusChartOptions = computed<EChartsCoreOption>(() => {
    const states = this.data()?.stateCounts ?? [];
    return {
      color: ['#ffb511', '#64b5f6', '#5ecb8b', '#9e9e9e', '#ff8a8a'],
      tooltip: { trigger: 'item' },
      legend: {
        bottom: 0,
        textStyle: { color: '#b3b3b3' },
      },
      series: [
        {
          name: 'Atendimentos',
          type: 'pie',
          radius: ['46%', '72%'],
          center: ['50%', '43%'],
          avoidLabelOverlap: true,
          label: {
            color: '#ffffff',
            formatter: '{b}: {c}',
          },
          data: states.map((state) => ({
            name: state.label,
            value: state.count,
          })),
        },
      ],
    };
  });

  constructor() {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.dashboardService.load());
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao carregar dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  async exportarExcel(): Promise<void> {
    this.exporting.set(true);
    this.error.set(null);
    try {
      await this.exportacaoService.exportarTudoExcel();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Erro ao exportar Excel');
    } finally {
      this.exporting.set(false);
    }
  }

  protected stateLabel(state: AtendimentoState): string {
    return ATENDIMENTO_STATE_LABEL[state];
  }

  protected servicosHojeLabel(atendimento: DashboardTodayAtendimento): string {
    if (atendimento.servicos.length > 0) {
      return atendimento.servicos
        .map((servico) =>
          servico.quantidade > 1 ? `${servico.quantidade}x ${servico.nome}` : servico.nome,
        )
        .join(', ');
    }
    return atendimento.descricaoSolicitacao?.trim() || 'Sem serviços vinculados';
  }

  protected pedidosHojeResumo(total: number): string {
    return total === 1
      ? '1 pedido criado no dia'
      : `${this.formatNumber(total)} pedidos criados no dia`;
  }

  protected pedidoHojeLabel(atendimento: DashboardTodayAtendimento): string {
    return `Abrir pedido de ${atendimento.clienteNome} no valor de ${this.formatCurrency(
      atendimento.valorCentavos,
    )}`;
  }

  protected formatCurrency(valueCentavos: number): string {
    return this.currencyFormatter.format(valueCentavos / 100);
  }

  private formatNumber(value: number): string {
    return this.numberFormatter.format(value);
  }
}
