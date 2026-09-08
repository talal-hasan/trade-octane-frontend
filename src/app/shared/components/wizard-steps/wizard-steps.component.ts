import { Component, computed, input, output } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../icon-registry';

export interface WizardStep {
  key: string;
  label: string;
  /** One-line answer to "what is this step for", shown under the label. */
  hint: string;
}

interface RenderedStep extends WizardStep {
  index: number;
  state: 'done' | 'current' | 'upcoming';
  /** True when the user may jump straight to this step. */
  reachable: boolean;
}

// Horizontal stepper header.
//
// Backwards navigation is always allowed — an admin who mis-picked a person must be able
// to go straight back without unwinding their access choices. Forwards is gated on
// `furthestReached`, so a step the user has not legitimately arrived at yet cannot be
// skipped into with an incomplete form behind it.
@Component({
  selector: 'to-wizard-steps',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './wizard-steps.component.html',
  styleUrl: './wizard-steps.component.scss',
})
export class WizardStepsComponent {
  readonly steps = input.required<readonly WizardStep[]>();
  readonly current = input.required<number>();
  /** Highest index the user has legitimately reached; anything beyond stays locked. */
  readonly furthestReached = input<number>(0);
  readonly stepSelected = output<number>();

  protected readonly icons = ICON_REGISTRY;

  protected readonly rendered = computed<RenderedStep[]>(() => {
    const current = this.current();
    const furthest = this.furthestReached();
    return this.steps().map((step, index) => ({
      ...step,
      index,
      state: index < current ? 'done' : index === current ? 'current' : 'upcoming',
      reachable: index <= Math.max(current, furthest),
    }));
  });

  /** Fill percentage of the connector track behind the markers. */
  protected readonly progress = computed(() => {
    const count = this.steps().length;
    if (count <= 1) {
      return 0;
    }
    return (this.current() / (count - 1)) * 100;
  });

  protected select(step: RenderedStep): void {
    if (step.reachable && step.index !== this.current()) {
      this.stepSelected.emit(step.index);
    }
  }
}
