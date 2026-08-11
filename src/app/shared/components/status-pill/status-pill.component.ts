import { Component, computed, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../icon-registry';

export type StatusPillStatus =
  | 'approved'
  | 'pending'
  | 'draft'
  | 'rejected'
  | 'overdue'
  | 'needs-attention';

const STATUS_LABELS: Record<StatusPillStatus, string> = {
  approved: 'Approved',
  pending: 'Pending',
  draft: 'Draft',
  rejected: 'Rejected',
  overdue: 'Overdue',
  'needs-attention': 'Needs Attention',
};

// Status pill — subtle background pattern only, never saturated fills (CLAUDE.md §5, §8).
@Component({
  selector: 'to-status-pill',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './status-pill.component.html',
  styleUrl: './status-pill.component.scss',
})
export class StatusPillComponent {
  readonly status = input.required<StatusPillStatus>();
  readonly label = input<string>();

  // "Needs attention" must never read as a silent/plain pill — master data drift on live
  // budgets has to visually stand out from a routine workflow status (CLAUDE.md §8).
  protected readonly icon = ICON_REGISTRY['alert-triangle'];

  protected readonly resolvedLabel = computed(() => this.label() ?? STATUS_LABELS[this.status()]);
}
