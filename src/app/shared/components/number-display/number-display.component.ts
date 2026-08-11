import { Component, computed, inject, input } from '@angular/core';

import { FormatService } from '../../../core/services/format.service';

export type NumberDisplayFormat = 'plain' | 'pkr' | 'percent';

// Tabular-nums number rendering with PKR/percent formatting and optional sign
// colouring (CLAUDE.md §9). Delegates all formatting to FormatService — never
// reimplement Intl.NumberFormat logic here.
@Component({
  selector: 'to-number',
  standalone: true,
  templateUrl: './number-display.component.html',
  styleUrl: './number-display.component.scss',
})
export class NumberDisplayComponent {
  readonly value = input.required<number | null | undefined>();
  readonly format = input<NumberDisplayFormat>('plain');
  readonly colorSign = input<boolean>(false);

  private readonly formatService = inject(FormatService);

  protected readonly displayValue = computed(() => {
    const value = this.value();
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    switch (this.format()) {
      case 'pkr':
        return this.formatService.formatPkr(value);
      case 'percent':
        return this.formatService.formatPercent(value);
      default:
        return this.formatService.formatNumber(value);
    }
  });

  protected readonly sign = computed(() => {
    const value = this.value();
    if (!this.colorSign() || value === null || value === undefined || Number.isNaN(value)) {
      return 'neutral';
    }
    return this.formatService.signOf(value);
  });
}
