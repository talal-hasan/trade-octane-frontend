import { Component, input } from '@angular/core';

// Completion confirmation with a drawn checkmark.
//
// The mark is an SVG path animated via stroke-dashoffset — a circle sweeping in, then the
// tick drawing on top, then the surrounding ring pulsing out once. It is the one place in
// the product with genuinely decorative motion, and it earns it: finishing a provisioning
// run is a discrete accomplishment, and a toast that vanishes in four seconds is a weak
// acknowledgement of one.
//
// Content after the mark is projected, so callers own the wording and the follow-on
// actions rather than this component guessing at them.
@Component({
  selector: 'to-success-panel',
  standalone: true,
  templateUrl: './success-panel.component.html',
  styleUrl: './success-panel.component.scss',
})
export class SuccessPanelComponent {
  readonly heading = input.required<string>();
  readonly description = input<string>('');
}
