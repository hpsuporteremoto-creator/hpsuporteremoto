import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AtendimentoState } from '../features/atendimento/atendimento.types';

export type FunilStepKey =
  | AtendimentoState
  | 'servicos'
  | 'whatsapp'
  | 'solicitacao'
  | 'credenciais'
  | 'atendimento';

type StepKey = FunilStepKey;

interface Step {
  readonly key: StepKey;
  readonly label: string;
  readonly icon: string;
}

const STEPS: ReadonlyArray<Step> = [
  { key: 'servicos', label: 'Serviços', icon: 'design_services' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'chat' },
  { key: 'solicitacao', label: 'Solicitação', icon: 'edit_note' },
  { key: 'credenciais', label: 'RustDesk', icon: 'desktop_windows' },
  { key: 'atendimento', label: 'Atendimento', icon: 'support_agent' },
  { key: 'pagamento', label: 'Pagamento', icon: 'qr_code_2' },
  { key: 'concluido', label: 'Concluído', icon: 'check_circle' },
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
  readonly currentStep = input<FunilStepKey | null>(null);

  protected readonly steps = STEPS;

  protected readonly currentIdx = computed(() => {
    const key = normalizeStep(this.currentStep() ?? this.currentState());
    const idx = STEPS.findIndex((s) => s.key === key);
    return idx >= 0 ? idx : 0;
  });
}

function normalizeStep(step: FunilStepKey | null): StepKey {
  if (step === 'aguardando_confirmacao' || step === 'em_andamento') {
    return 'atendimento';
  }
  if (step === 'recusado') {
    return 'atendimento';
  }
  return step ?? 'servicos';
}
