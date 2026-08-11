import { Component, input } from '@angular/core';

import { RelativeDatePipe } from '../../pipes/relative-date.pipe';

export interface ActivityEntry {
  actor: string;
  action: string;
  timestamp: Date | string;
  remarks?: string;
}

// Vertical audit-trail timeline (CLAUDE.md §9) — used on approval detail screens for
// remarks history. Purely presentational; caller supplies ordered entries.
@Component({
  selector: 'to-activity-timeline',
  standalone: true,
  imports: [RelativeDatePipe],
  templateUrl: './activity-timeline.component.html',
  styleUrl: './activity-timeline.component.scss',
})
export class ActivityTimelineComponent {
  readonly entries = input.required<ActivityEntry[]>();

  // relativeDate is intentionally coarse ("2 days ago") — the title attribute exposes
  // the exact moment on hover, which matters for an audit trail.
  protected absoluteLabel(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
}
