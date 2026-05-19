import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AtendimentoState } from '../features/atendimento/atendimento.types';

type StepKey = AtendimentoState | 'inicial';

interface Step {
  readonly key: StepKey;
  readonly label: string;
  readonly icon: string;
}

const STEPS: ReadonlyArray<Step> = [
  { key: 'inicial',                label: 'Solicitação',  icon: 'edit_note' },
  { key: 'aguardando_confirmacao', label: 'Aguardando',   icon: 'hourglass_empty' },
  { key: 'em_andamento',           label: 'Em andamento', icon: 'support_agent' },
  { key: 'faturamento',            label: 'Faturamento',  icon: 'request_quote' },
  { key: 'pagamento',              label: 'Pagamento',    icon: 'qr_code_2' },
  { key: 'concluido',              label: 'Concluído',    icon: 'check_circle' },
];

@Component({
  selector: 'hp-funil-stepper',
  imports: [MatIconModule],
  template: `
    <ol class="stepper" role="list" aria-label="Progresso do atendimento">
      @for (step of steps; track step.key; let i = $index) {
        <li
          class="step"
          [class.done]="i < currentIdx()"
          [class.current]="i === currentIdx()"
          [class.pending]="i > currentIdx()"
          [attr.aria-current]="i === currentIdx() ? 'step' : null"
        >
          <span class="dot">
            @if (i < currentIdx()) {
              <mat-icon>check</mat-icon>
            } @else {
              <mat-icon>{{ step.icon }}</mat-icon>
            }
          </span>
          <span class="label">{{ step.label }}</span>
        </li>
      }
    </ol>
  `,
  styleUrl: './funil-stepper.sass',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FunilStepper {
  readonly currentState = input<AtendimentoState | null>(null);

  protected readonly steps = STEPS;

  protected readonly currentIdx = computed(() => {
    const state = this.currentState();
    const key: StepKey = state ?? 'inicial';
    const idx = STEPS.findIndex((s) => s.key === key);
    return idx >= 0 ? idx : 0;
  });
}
