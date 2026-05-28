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
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  ServicoCategoriasService,
  ServicosService,
} from '../servicos.service';
import { ServicoCategoria, ServicoFormData } from '../servicos.types';
import { normalizeServiceImageUrl } from '../../../../shared/image-url.util';

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
    MatSelectModule,
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

    @if (loading() || saving() || uploadingImage()) {
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
              <mat-label>Categoria</mat-label>
              <mat-icon matIconPrefix>category</mat-icon>
              <mat-select formControlName="categoria_id">
                <mat-option value="">Sem categoria</mat-option>
                @for (categoria of categorias(); track categoria.id) {
                  <mat-option [value]="categoria.id">
                    {{ categoria.nome }}
                    @if (!categoria.ativo) {
                      (inativa)
                    }
                  </mat-option>
                }
              </mat-select>
              <mat-hint>Opcional. Use "Sem categoria" quando não quiser agrupar.</mat-hint>
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Descrição do serviço</mat-label>
              <textarea
                matInput
                formControlName="descricao"
                rows="4"
                required
              ></textarea>
              @if (form.controls.descricao.hasError('required')) {
                <mat-error>Descrição é obrigatória</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>URL da imagem</mat-label>
              <mat-icon matIconPrefix>image</mat-icon>
              <input
                matInput
                type="url"
                formControlName="imagem_url"
                placeholder="https://..."
                (input)="onImagemUrlChange($event)"
                (blur)="normalizarImagemUrl()"
              />
              @if (form.controls.imagem_url.hasError('pattern')) {
                <mat-error>Use uma URL começando com http:// ou https://</mat-error>
              }
            </mat-form-field>

            <section class="upload-area" aria-label="Upload de imagem do serviço">
              <input
                #imageInput
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                class="file-input"
                (change)="onImagemSelecionada($event)"
              />
              <button
                mat-stroked-button
                type="button"
                (click)="imageInput.click()"
                [disabled]="uploadingImage() || saving() || loading()"
              >
                <mat-icon>upload</mat-icon>
                <span>{{ uploadingImage() ? 'Enviando imagem' : 'Enviar imagem' }}</span>
              </button>
              @if (imagemPreview()) {
                <button
                  mat-button
                  type="button"
                  (click)="removerImagem()"
                  [disabled]="uploadingImage() || saving()"
                >
                  <mat-icon>hide_image</mat-icon>
                  <span>Remover imagem</span>
                </button>
              }
              <small class="upload-help">JPG, PNG, WebP ou GIF até 5 MB.</small>
            </section>

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

            @if (imagemPreview(); as url) {
              <figure class="image-preview">
                <img [src]="url" alt="Prévia da imagem do serviço" loading="lazy" />
              </figure>
            }

            <mat-slide-toggle formControlName="ativo">Serviço ativo</mat-slide-toggle>
            <mat-slide-toggle formControlName="vitrine">
              Exibir no site
            </mat-slide-toggle>

            <div class="actions">
              <button
                mat-flat-button
                color="primary"
                type="submit"
                [disabled]="form.invalid || saving() || loading() || uploadingImage()"
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
  private readonly categoriasSvc = inject(ServicoCategoriasService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly id = signal<string | null>(null);
  protected readonly isNew = computed(() => this.id() === null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly uploadingImage = signal(false);
  protected readonly categorias = signal<ServicoCategoria[]>([]);
  protected readonly imagemUrl = signal('');
  protected readonly imagemPreview = computed(() => {
    const value = normalizeServiceImageUrl(this.imagemUrl()) ?? '';
    return /^https?:\/\//i.test(value) ? value : null;
  });

  protected readonly form = this.fb.group({
    nome: ['', [Validators.required, Validators.minLength(2)]],
    categoria_id: [''],
    descricao: ['', [Validators.required, Validators.minLength(2)]],
    imagem_url: ['', [Validators.pattern(/^https?:\/\/.+/i)]],
    valor_reais: [0, [Validators.required, Validators.min(0)]],
    ativo: [true],
    vitrine: [true],
  });

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    void this.carregarCategorias();
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
        categoria_id: servico.categoria_id ?? '',
        descricao: servico.descricao ?? '',
        imagem_url: servico.imagem_url ?? '',
        valor_reais: servico.valor_centavos / 100,
        ativo: servico.ativo,
        vitrine: servico.vitrine !== false,
      });
      this.imagemUrl.set(servico.imagem_url ?? '');
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
    const imagemUrl = normalizeServiceImageUrl(value.imagem_url);
    this.form.controls.imagem_url.setValue(imagemUrl ?? '', { emitEvent: false });
    this.imagemUrl.set(imagemUrl ?? '');
    const data: ServicoFormData = {
      nome: value.nome.trim(),
      categoria_id: value.categoria_id || null,
      descricao: value.descricao.trim() || null,
      imagem_url: imagemUrl,
      valor_centavos: Math.round(value.valor_reais * 100),
      ativo: value.ativo,
      vitrine: value.vitrine,
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

  onImagemUrlChange(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.imagemUrl.set(input?.value ?? '');
  }

  async onImagemSelecionada(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.type)) {
      this.snackBar.open('Envie uma imagem JPG, PNG, WebP ou GIF.', 'OK', {
        duration: 3500,
      });
      if (input) input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.snackBar.open('A imagem deve ter até 5 MB.', 'OK', { duration: 3500 });
      if (input) input.value = '';
      return;
    }

    this.uploadingImage.set(true);
    try {
      const url = await this.svc.uploadImagem(file);
      this.form.controls.imagem_url.setValue(url);
      this.form.controls.imagem_url.markAsDirty();
      this.imagemUrl.set(url);
      this.snackBar.open('Imagem enviada.', 'OK', { duration: 2500 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar imagem';
      this.snackBar.open(msg, 'OK', { duration: 4500 });
    } finally {
      this.uploadingImage.set(false);
      if (input) input.value = '';
    }
  }

  removerImagem(): void {
    this.form.controls.imagem_url.setValue('');
    this.form.controls.imagem_url.markAsDirty();
    this.imagemUrl.set('');
  }

  normalizarImagemUrl(): void {
    const value = this.form.controls.imagem_url.value;
    const normalized = normalizeServiceImageUrl(value);
    if ((normalized ?? '') === value.trim()) return;
    this.form.controls.imagem_url.setValue(normalized ?? '');
    this.imagemUrl.set(normalized ?? '');
  }

  private async carregarCategorias(): Promise<void> {
    this.loading.set(true);
    try {
      this.categorias.set(await this.categoriasSvc.list());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar categorias';
      this.snackBar.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.loading.set(false);
    }
  }
}
