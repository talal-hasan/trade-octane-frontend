import { Component, computed, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TooltipModule } from 'primeng/tooltip';

import { ICON_REGISTRY } from '../../icon-registry';

export type PipelineStageState = 'completed' | 'current' | 'upcoming';
export type PipelineStageVariant = 'horizontal' | 'compact';

interface PipelineStageView {
  label: string;
  state: PipelineStageState;
}

// Generic N-stage pipeline visual (CLAUDE.md §9 / §8 Claims). The component has no
// knowledge of Claims' VBase -> Trade Spend -> Pujar names — the caller supplies any
// ordered stage list, so this is reusable for other pipelines too.
@Component({
  selector: 'to-pipeline-stage',
  standalone: true,
  imports: [TablerIconComponent, TooltipModule],
  templateUrl: './pipeline-stage.component.html',
  styleUrl: './pipeline-stage.component.scss',
})
export class PipelineStageComponent {
  readonly stages = input.required<string[]>();
  readonly currentStageIndex = input.required<number>();
  readonly variant = input<PipelineStageVariant>('horizontal');

  protected readonly checkIcon = ICON_REGISTRY['check'];

  protected readonly stageViews = computed<PipelineStageView[]>(() =>
    this.stages().map((label, index) => ({
      label,
      state:
        index < this.currentStageIndex()
          ? 'completed'
          : index === this.currentStageIndex()
            ? 'current'
            : 'upcoming',
    })),
  );
}
