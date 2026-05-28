import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

type DescriptionAction = 'heading' | 'paragraph' | 'bulleted' | 'numbered' | 'quote' | 'divider';

@Component({
  selector: 'hp-servico-description-editor',
  imports: [MatButtonModule, MatIconModule, MatTooltipModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ServicoDescriptionEditorComponent),
      multi: true,
    },
  ],
  template: `
    <section
      class="editor"
      [class.is-disabled]="disabled()"
      [class.is-invalid]="invalid()"
      aria-labelledby="servico-description-label"
    >
      <header class="editor-header">
        <div>
          <span id="servico-description-label">{{ label() }}</span>
          <small>{{ helperText() }}</small>
        </div>
        <strong>{{ characterCount() }} caracteres</strong>
      </header>

      <div class="toolbar" role="toolbar" aria-label="Ferramentas da descrição">
        <button
          mat-icon-button
          type="button"
          (click)="applyAction('heading')"
          [disabled]="disabled()"
          aria-label="Inserir título"
          matTooltip="Título"
        >
          <mat-icon>title</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="applyAction('paragraph')"
          [disabled]="disabled()"
          aria-label="Inserir parágrafo"
          matTooltip="Parágrafo"
        >
          <mat-icon>notes</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="applyAction('bulleted')"
          [disabled]="disabled()"
          aria-label="Inserir lista"
          matTooltip="Lista"
        >
          <mat-icon>format_list_bulleted</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="applyAction('numbered')"
          [disabled]="disabled()"
          aria-label="Inserir lista numerada"
          matTooltip="Lista numerada"
        >
          <mat-icon>format_list_numbered</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="applyAction('quote')"
          [disabled]="disabled()"
          aria-label="Inserir destaque"
          matTooltip="Destaque"
        >
          <mat-icon>format_quote</mat-icon>
        </button>
        <button
          mat-icon-button
          type="button"
          (click)="applyAction('divider')"
          [disabled]="disabled()"
          aria-label="Inserir separador"
          matTooltip="Separador"
        >
          <mat-icon>horizontal_rule</mat-icon>
        </button>
      </div>

      <textarea
        #textarea
        [value]="value()"
        [disabled]="disabled()"
        rows="12"
        required
        spellcheck="true"
        placeholder="Escreva a descrição em blocos. Use linhas em branco para separar seções."
        (input)="onInput($event)"
        (blur)="markTouched()"
      ></textarea>

      @if (invalid()) {
        <p class="editor-error">{{ errorText() }}</p>
      }
    </section>
  `,
  styleUrl: './servico-description-editor.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicoDescriptionEditorComponent implements ControlValueAccessor {
  readonly label = input('Descrição do serviço');
  readonly helperText = input('Organize em blocos, listas e parágrafos.');
  readonly errorText = input('Descrição é obrigatória');
  readonly invalid = input(false);

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly characterCount = signal(0);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.setInternalValue(value ?? '', false);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onInput(event: Event): void {
    const inputElement = event.target as HTMLTextAreaElement | null;
    this.setInternalValue(inputElement?.value ?? '', true);
  }

  protected markTouched(): void {
    this.onTouched();
  }

  protected applyAction(action: DescriptionAction): void {
    const textarea = this.textarea()?.nativeElement;
    if (!textarea || this.disabled()) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = this.value();
    const selected = current.slice(start, end);
    const replacement = buildReplacement(action, selected);
    const nextValue = `${current.slice(0, start)}${replacement}${current.slice(end)}`;

    this.setInternalValue(nextValue, true);
    this.onTouched();

    const cursorPosition = start + replacement.length;
    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  private setInternalValue(value: string, emit: boolean): void {
    this.value.set(value);
    this.characterCount.set(value.trim().length);
    if (emit) this.onChange(value);
  }
}

function buildReplacement(action: DescriptionAction, selected: string): string {
  const text = selected.trim();
  switch (action) {
    case 'heading':
      return block(text ? text.toUpperCase() : 'Título da seção');
    case 'paragraph':
      return block(text || 'Novo parágrafo');
    case 'bulleted':
      return block(formatLines(text || 'Item da lista', (line) => `• ${line}`));
    case 'numbered':
      return block(formatLines(text || 'Item da lista', (line, index) => `${index + 1}. ${line}`));
    case 'quote':
      return block(formatLines(text || 'Texto em destaque', (line) => `“${line}”`));
    case 'divider':
      return '\n\n────────\n\n';
  }
}

function block(value: string): string {
  return `\n\n${value}\n\n`;
}

function formatLines(
  value: string,
  formatter: (line: string, index: number) => string,
): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => formatter(line, index))
    .join('\n');
}
