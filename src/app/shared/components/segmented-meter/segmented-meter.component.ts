import { Component, computed, input } from '@angular/core';

import { BreakdownRow } from '../../../features/dashboard/models/dashboard.model';

interface Segment {
  label: string;
  width: number;
  colour: string;
}

// A single bar split into brand-coloured segments showing composition — the client's
// reference mock uses exactly this above its breakdown list.
//
// It is also the most defensible place in the product to run several support colours at
// once: the FrieslandCampina star brandmark itself is orange → lime → green → sky →
// magenta, so a polychrome bar reads as the identity rather than against it.
@Component({
  selector: 'to-segmented-meter',
  standalone: true,
  templateUrl: './segmented-meter.component.html',
  styleUrl: './segmented-meter.component.scss',
})
export class SegmentedMeterComponent {
  readonly rows = input.required<readonly BreakdownRow[]>();

  protected readonly segments = computed<Segment[]>(() =>
    this.rows().map((row, index) => ({
      label: row.label,
      width: row.share,
      // Wraps at 6, the viz palette length — beyond that categorical colour stops being
      // distinguishable anyway, so wrapping beats inventing new hues.
      colour: `var(--to-viz-${(index % 6) + 1})`,
    })),
  );
}
