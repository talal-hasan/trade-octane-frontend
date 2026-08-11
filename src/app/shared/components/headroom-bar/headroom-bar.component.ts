import { Component, computed, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../icon-registry';
import { PkrCurrencyPipe } from '../../pipes/pkr-currency.pipe';

// Budget headroom visualisation (CLAUDE.md §8 Budget rule): live-updating stacked bar
// showing consumed vs pending vs remaining budget. `pending` is the amount currently
// being entered/requested — not yet committed — so it renders visually distinct from
// `consumed`. Overrun is a hard block: the whole bar flips to danger and an inline error
// appears, per "Budget overrun = hard block with clear inline error and headroom
// visualisation."
@Component({
  selector: 'to-headroom-bar',
  standalone: true,
  imports: [PkrCurrencyPipe, TablerIconComponent],
  templateUrl: './headroom-bar.component.html',
  styleUrl: './headroom-bar.component.scss',
})
export class HeadroomBarComponent {
  readonly total = input.required<number>();
  readonly consumed = input.required<number>();
  readonly pending = input<number>(0);

  protected readonly alertIcon = ICON_REGISTRY['alert-triangle'];

  protected readonly remaining = computed(() => this.total() - this.consumed() - this.pending());
  protected readonly isOverrun = computed(() => this.remaining() < 0);
  protected readonly overrunAmount = computed(() => Math.abs(this.remaining()));

  protected readonly consumedPct = computed(() => this.percentOf(this.consumed()));
  protected readonly pendingPct = computed(() => this.percentOf(this.pending()));

  // Guards against divide-by-zero for a budget line with no total yet, and clamps so a
  // single segment never visually overflows the track before the overrun state takes over.
  private percentOf(value: number): number {
    const total = this.total();
    if (total <= 0) {
      return 0;
    }
    return Math.min(100, Math.max(0, (value / total) * 100));
  }
}
