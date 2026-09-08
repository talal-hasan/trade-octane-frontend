import { Component, computed, inject, input } from '@angular/core';

import { FormatService } from '../../../core/services/format.service';
import { BarDatum, TileTone } from '../../../features/dashboard/models/dashboard.model';

export type BarChartUnit = 'pkr' | 'litres' | 'count';

interface RenderedBar {
  label: string;
  /** 0–100, width of the filled portion. */
  percent: number;
  valueLabel: string;
  /** Secondary "of total" text, only when the datum carries a total. */
  totalLabel: string | null;
  tone: TileTone;
  /** True when value exceeds total — the bar is drawn in Passion red and capped. */
  overrun: boolean;
}

// Horizontal bar chart, hand-built in CSS rather than pulled from a charting library.
//
// Three reasons: it adds no dependency to a locked stack (CLAUDE.md §3); it inherits the
// brand tokens directly so a palette change propagates without touching chart config; and
// at this scale (3–5 categorical bars) a library buys nothing but weight. If a chart ever
// needs axes, zoom or time series, that is the point to revisit — not before.
@Component({
  selector: 'to-bar-chart',
  standalone: true,
  templateUrl: './bar-chart.component.html',
  styleUrl: './bar-chart.component.scss',
})
export class BarChartComponent {
  private readonly format = inject(FormatService);

  readonly data = input.required<readonly BarDatum[]>();
  readonly unit = input<BarChartUnit>('count');
  /** When true, each bar takes its own colour from the viz series instead of the accent. */
  readonly categorical = input(false);

  protected readonly bars = computed<RenderedBar[]>(() => {
    const data = this.data();
    // Bars without a `total` are compared against the largest value in the set, so the
    // longest bar always fills the track and the rest read relative to it.
    const peak = Math.max(...data.map((datum) => datum.total ?? datum.value), 1);

    return data.map((datum) => {
      const basis = datum.total ?? peak;
      const overrun = datum.total !== undefined && datum.value > datum.total;
      return {
        label: datum.label,
        percent: Math.min(100, (datum.value / basis) * 100),
        valueLabel: this.formatValue(datum.value),
        totalLabel: datum.total === undefined ? null : this.formatValue(datum.total),
        tone: datum.tone ?? 'accent',
        overrun,
      };
    });
  });

  protected seriesVar(index: number): string {
    // Wraps at 6 — the viz palette length. Categorical colour beyond that stops being
    // distinguishable anyway, so wrapping is preferable to generating new hues.
    return `var(--to-viz-${(index % 6) + 1})`;
  }

  private formatValue(value: number): string {
    switch (this.unit()) {
      case 'pkr':
        return this.format.formatPkrCompact(value);
      // Litres, never cartons — the industry unit throughout (KT §8).
      case 'litres':
        return `${this.format.formatCompact(value)} L`;
      default:
        return this.format.formatNumber(value);
    }
  }
}
