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
import { MatChipsModule, MatChipListboxChange } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ServicosService } from '../../admin/servicos/servicos.service';
import { Servico } from '../../admin/servicos/servicos.types';
import { AtendimentoService } from '../atendimento.service';
import { ClienteLookupResult, ConexaoFormData } from '../atendimento.types';

const SEM_CATEGORIA = 'Outros';

@Component({
  selector: 'hp-conexao-form',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    CdkTextareaAutosize,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  template: `
    <div class="conexao">
      @if (preFill()) {
        <button
          mat-button
          type="button"
          class="back-btn"
          (click)="back.emit()"
        >
          <mat-icon>arrow_back</mat-icon>
          <span>Trocar WhatsApp</span>
        </button>
      }

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

      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <section class="picker">
          <h2>O que você precisa?</h2>

          @if (servicos().length > 0) {
            <mat-form-field appearance="outline" class="search">
              <mat-icon matIconPrefix>search</mat-icon>
              <input
                matInput
                placeholder="Buscar serviço…"
                [value]="search()"
                (input)="onSearchInput($event)"
              />
              @if (search()) {
                <button
                  matIconSuffix
                  mat-icon-button
                  type="button"
                  (click)="search.set('')"
                  aria-label="Limpar busca"
                >
                  <mat-icon>close</mat-icon>
                </button>
              }
            </mat-form-field>

            @if (categorias().length > 1) {
              <mat-chip-listbox
                [multiple]="false"
                (change)="onCategoriaChange($event)"
                hideSingleSelectionIndicator
                aria-label="Filtrar por categoria"
              >
                <mat-chip-option [selected]="categoriaFiltro() === null" [value]="''">
                  Todos
                </mat-chip-option>
                @for (cat of categorias(); track cat) {
                  <mat-chip-option
                    [selected]="categoriaFiltro() === cat"
                    [value]="cat"
                  >{{ cat }}</mat-chip-option>
                }
              </mat-chip-listbox>
            }

            @if (servicosAgrupados().length === 0) {
              <p class="empty">Nenhum serviço encontrado.</p>
            } @else {
              <div class="grupos">
                @for (grupo of servicosAgrupados(); track grupo.categoria) {
                  <div class="grupo">
                    <h3 class="grupo-titulo">{{ grupo.categoria }}</h3>
                    <div class="grupo-cards">
                      @for (s of grupo.servicos; track s.id) {
                        <mat-card
                          class="servico-option"
                          appearance="filled"
                          [class.selected]="selectedServicoId() === s.id"
                          (click)="toggleServico(s)"
                          tabindex="0"
                          (keydown.enter)="toggleServico(s)"
                          (keydown.space)="toggleServico(s); $event.preventDefault()"
                          role="button"
                          [attr.aria-pressed]="selectedServicoId() === s.id"
                        >
                          <mat-card-content class="servico-option-content">
                            <strong class="servico-nome">{{ s.nome }}</strong>
                            <span class="servico-valor">
                              {{ s.valor_centavos / 100 | currency }}
                            </span>
                          </mat-card-content>
                        </mat-card>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          } @else if (servicosLoaded()) {
            <p class="empty">Nenhum serviço cadastrado ainda — descreva sua necessidade no campo abaixo.</p>
          }

          <mat-form-field appearance="outline" class="descricao">
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
  private readonly servicosSvc = inject(ServicosService);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly preFill = input<ClienteLookupResult | null>(null);
  readonly created = output<string>();
  readonly back = output<void>();

  protected readonly servicos = signal<Servico[]>([]);
  protected readonly servicosLoaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly search = signal('');
  protected readonly categoriaFiltro = signal<string | null>(null);
  protected readonly selectedServicoId = signal<string | null>(null);

  protected readonly whatsappLocked = computed(() => this.preFill() !== null);

  protected readonly categorias = computed(() => {
    const set = new Set<string>();
    for (const s of this.servicos()) {
      set.add(s.categoria?.trim() || SEM_CATEGORIA);
    }
    return Array.from(set).sort((a, b) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b, 'pt-BR');
    });
  });

  protected readonly servicosAgrupados = computed<
    ReadonlyArray<{ categoria: string; servicos: ReadonlyArray<Servico> }>
  >(() => {
    const term = this.search().toLowerCase().trim();
    const filtro = this.categoriaFiltro();
    const filtered = this.servicos().filter((s) => {
      const cat = s.categoria?.trim() || SEM_CATEGORIA;
      if (filtro !== null && cat !== filtro) return false;
      if (term && !s.nome.toLowerCase().includes(term)) return false;
      return true;
    });

    const map = new Map<string, Servico[]>();
    for (const s of filtered) {
      const cat = s.categoria?.trim() || SEM_CATEGORIA;
      const arr = map.get(cat) ?? [];
      arr.push(s);
      map.set(cat, arr);
    }

    const ordered = Array.from(map.entries()).sort(([a], [b]) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b, 'pt-BR');
    });

    return ordered.map(([categoria, servicos]) => ({ categoria, servicos }));
  });

  protected readonly form = this.fb.group({
    servico_id: this.fb.control<string | null>(null),
    descricao_solicitacao: [''],
    nome: ['', [Validators.required, Validators.minLength(2)]],
    whatsapp: ['', [Validators.required, Validators.minLength(10)]],
    instagram: [''],
    email: ['', [Validators.email]],
    rustdesk_id: ['', [Validators.required, Validators.minLength(6)]],
    rustdesk_password: ['', [Validators.required, Validators.minLength(4)]],
  });

  constructor() {
    void this.carregarServicos();

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

  onSearchInput(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  onCategoriaChange(event: MatChipListboxChange): void {
    const value = event.value;
    if (typeof value === 'string' && value.length > 0) {
      this.categoriaFiltro.set(value);
    } else {
      this.categoriaFiltro.set(null);
    }
  }

  toggleServico(s: Servico): void {
    if (this.selectedServicoId() === s.id) {
      this.selectedServicoId.set(null);
      this.form.controls.servico_id.setValue(null);
    } else {
      this.selectedServicoId.set(s.id);
      this.form.controls.servico_id.setValue(s.id);
    }
  }

  async carregarServicos(): Promise<void> {
    try {
      const list = await this.servicosSvc.listAtivos();
      this.servicos.set(list);
    } catch {
      // Falha silenciosa — o cliente ainda pode descrever em texto livre.
    } finally {
      this.servicosLoaded.set(true);
    }
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
      servico_id: value.servico_id,
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
