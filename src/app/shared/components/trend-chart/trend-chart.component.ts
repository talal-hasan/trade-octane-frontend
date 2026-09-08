import { Component, computed, inject, input, signal } from '@angular/core';

import { FormatService } from '../../../core/services/format.service';
import { TrendPoint } from '../../../features/dashboard/models/dashboard.model';

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;

interface PlottedPoint extends TrendPoint {
  x: number;
  y: number;
  display: string;
}

// Area + line trend chart, hand-built as inline SVG for the same reasons as the bar and
// donut charts: no dependency on a locked stack, and the marks read `--to-viz-*` and the
// brand gradient directly.
//
// The viewBox is fixed and the SVG scales with `preserveAspectRatio="none"` on the fill
// only — the line itself uses vector-effect: non-scaling-stroke so it stays 2px at every
// container width rather than stretching into a wedge.
@Component({
  selector: 'to-trend-chart',
  standalone: true,
  templateUrl: './trend-chart.component.html',
  styleUrl: './trend-chart.component.scss',
})
export class TrendChartComponent {
  private readonly format = inject(FormatService);

  readonly data = input.required<readonly TrendPoint[]>();
  /** Rendered after the value in the hover readout, e.g. "approvals". */
  readonly unit = input<string>('');

  protected readonly viewBox = `0 0 ${VIEW_W} ${VIEW_H}`;
  protected readonly hovered = signal<number | null>(null);

  protected readonly points = computed<PlottedPoint[]>(() => {
    const data = this.data();
    if (data.length === 0) {
      return [];
    }

    const values = data.map((point) => point.value);
    const max = Math.max(...values);
    // Floor the scale at zero rather than at the minimum. Starting the axis at the lowest
    // value exaggerates small movements into cliffs — a well-known way to mislead with a
    // trend line, and not something a spend dashboard should do.
    const span = max === 0 ? 1 : max;
    const usableW = VIEW_W - PAD_X * 2;
    const usableH = VIEW_H - PAD_TOP - PAD_BOTTOM;
    const step = data.length === 1 ? 0 : usableW / (data.length - 1);

    return data.map((point, index) => ({
      ...point,
      x: PAD_X + step * index,
      y: PAD_TOP + usableH - (point.value / span) * usableH,
      display: this.format.formatNumber(point.value),
    }));
  });

  /** Smooth cubic path through the points — a straight polyline reads as jagged noise. */
  protected readonly linePath = computed(() => {
    const points = this.points();
    if (points.length === 0) {
      return '';
    }
    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      // Horizontal-only control points keep the curve monotonic between samples, so the
      // line never overshoots above a peak or below a trough it didn't actually reach.
      const cx = (previous.x + current.x) / 2;
      path += ` C ${cx} ${previous.y}, ${cx} ${current.y}, ${current.x} ${current.y}`;
    }
    return path;
  });

  /** The line path closed down to the baseline, for the gradient fill beneath it. */
  protected readonly areaPath = computed(() => {
    const points = this.points();
    const line = this.linePath();
    if (points.length === 0) {
      return '';
    }
    const baseline = VIEW_H - PAD_BOTTOM;
    const last = points[points.length - 1];
    return `${line} L ${last.x} ${baseline} L ${points[0].x} ${baseline} Z`;
  });

  protected readonly activePoint = computed(() => {
    const index = this.hovered();
    return index === null ? null : (this.points()[index] ?? null);
  });

  protected readonly baselineY = VIEW_H - PAD_BOTTOM;
  protected readonly labelY = VIEW_H - 6;

  protected setHovered(index: number | null): void {
    this.hovered.set(index);
  }
}
