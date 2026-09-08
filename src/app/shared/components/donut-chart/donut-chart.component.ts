import { Component, computed, inject, input } from '@angular/core';

import { FormatService } from '../../../core/services/format.service';
import { SliceDatum } from '../../../features/dashboard/models/dashboard.model';

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Gap between arcs, in path units — keeps adjacent slices visually separate. */
const GAP = 3;

interface RenderedSlice {
  label: string;
  value: number;
  percentLabel: string;
  colour: string;
  /** SVG stroke-dasharray: visible arc length, then the rest of the circle. */
  dashArray: string;
  /** SVG stroke-dashoffset positioning this arc after the preceding ones. */
  dashOffset: number;
}

// Donut chart as a single inline SVG circle per slice, offset around the ring with
// stroke-dasharray. Hand-built for the same reasons as to-bar-chart: no dependency on a
// locked stack, and the arcs read brand tokens directly.
//
// Deliberately capped at a handful of slices — a donut stops being readable past ~5
// categories, and every use here (scheme type, claim type) is a 2–3 way split.
@Component({
  selector: 'to-donut-chart',
  standalone: true,
  templateUrl: './donut-chart.component.html',
  styleUrl: './donut-chart.component.scss',
})
export class DonutChartComponent {
  private readonly format = inject(FormatService);

  readonly data = input.required<readonly SliceDatum[]>();
  /** Label under the centre figure, e.g. "schemes". */
  readonly caption = input<string>('');

  protected readonly radius = RADIUS;
  protected readonly total = computed(() =>
    this.data().reduce((sum, slice) => sum + slice.value, 0),
  );
  protected readonly totalLabel = computed(() => this.format.formatNumber(this.total()));

  protected readonly slices = computed<RenderedSlice[]>(() => {
    const total = this.total();
    if (total === 0) {
      return [];
    }

    let consumed = 0;
    return this.data().map((slice, index) => {
      const arc = (slice.value / total) * CIRCUMFERENCE;
      // Shrink each arc by the gap so slices don't touch. A single 100% slice keeps its
      // full length — there is no neighbour to separate it from, and gapping it would
      // leave a stray notch in a complete ring.
      const drawn = this.data().length > 1 ? Math.max(arc - GAP, 0) : arc;
      const rendered: RenderedSlice = {
        label: slice.label,
        value: slice.value,
        percentLabel: this.format.formatPercent((slice.value / total) * 100),
        colour: `var(--to-viz-${(index % 6) + 1})`,
        dashArray: `${drawn} ${CIRCUMFERENCE - drawn}`,
        // Negative offset advances the arc clockwise past everything already drawn.
        dashOffset: -consumed,
      };
      consumed += arc;
      return rendered;
    });
  });
}
