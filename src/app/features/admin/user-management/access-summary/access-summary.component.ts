import { Component, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../../../shared/icon-registry';

// The live consequence panel.
//
// Microsoft Entra puts this behind a "Review + create" tab, which means an admin makes
// every decision blind and only sees the result once. Here it recomputes on every click
// and stays on screen, so the question "what am I about to grant this person?" is
// answered continuously rather than once at the end.
//
// Content is passed in fully resolved — this component formats and lays out, it does not
// derive. Keeping the derivation in the form keeps a single source of truth for what the
// grant actually is.
@Component({
  selector: 'to-access-summary',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './access-summary.component.html',
  styleUrl: './access-summary.component.scss',
})
export class AccessSummaryComponent {
  /** Plain-English restatement of the grant. */
  readonly effect = input.required<string>();
  readonly roleCount = input.required<number>();
  readonly permissionCount = input.required<number>();
  readonly regionCount = input.required<number>();
  /** Rendered verbatim — the form passes "All" when no brand filter is set. */
  readonly brandLabel = input.required<string>();
  /** Interaction count so far, kept visible as the client's "fewest clicks" criterion. */
  readonly clicks = input.required<number>();
  /** Where this access came from — a template name, a mirrored user, or neither. */
  readonly sourceLabel = input<string | null>(null);
  readonly sourceIcon = input<string>('check');
  /** True when the admin has hand-edited away from the template they applied. */
  readonly drifted = input(false);
  readonly showError = input(false);

  protected readonly icons = ICON_REGISTRY;
}
