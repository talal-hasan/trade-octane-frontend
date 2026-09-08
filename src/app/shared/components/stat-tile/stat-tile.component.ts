import { Component, computed, inject, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { FormatService } from '../../../core/services/format.service';
import { Delta, TileTone } from '../../../features/dashboard/models/dashboard.model';
import { ICON_REGISTRY } from '../../icon-registry';

// Compact KPI tile.
//
// Replaces the first-pass dashboard cards, which were ~170px tall to carry one number and
// a sentence of caption — a lot of page for very little. This is ~84px and carries more:
// the figure, a tinted module icon, and a delta against the previous period. Four of them
// fit in the space one of the old cards took.
//
// The delta is the point. "6 claims past SLA" is close to meaningless on its own; "6, down
// 33% vs last week" is a status report. Colour follows the *meaning* of the movement, not
// its direction — more volume is good, more SLA breaches is not — so `Delta.good` drives
// the hue and the arrow only shows which way it went.
@Component({
  selector: 'to-stat-tile',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './stat-tile.component.html',
  styleUrl: './stat-tile.component.scss',
})
export class StatTileComponent {
  private readonly format = inject(FormatService);

  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly icon = input<string>('inbox');
  readonly tone = input<TileTone>('accent');
  readonly delta = input<Delta | undefined>();

  protected readonly icons = ICON_REGISTRY;

  protected readonly iconData = computed(
    () => ICON_REGISTRY[this.icon()] ?? ICON_REGISTRY['inbox'],
  );

  protected readonly displayValue = computed(() => this.format.formatNumber(this.value()));

  protected readonly arrowIcon = computed(() => {
    const delta = this.delta();
    if (!delta || delta.direction === 'flat') {
      return ICON_REGISTRY['minus'];
    }
    return delta.direction === 'up' ? ICON_REGISTRY['trending-up'] : ICON_REGISTRY['trending-down'];
  });

  /** 'good' | 'bad' | 'flat' — the class suffix that colours the delta chip. */
  protected readonly deltaClass = computed(() => {
    const delta = this.delta();
    if (!delta || delta.direction === 'flat') {
      return 'flat';
    }
    return delta.good ? 'good' : 'bad';
  });

  protected readonly deltaLabel = computed(() => {
    const delta = this.delta();
    if (!delta) {
      return '';
    }
    return delta.direction === 'flat' ? 'No change' : `${delta.percent}%`;
  });
}
