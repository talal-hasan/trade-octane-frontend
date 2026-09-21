import { Component, input, output } from '@angular/core';

import {
  APPROVAL_STAGE_LABELS,
  APPROVAL_TABLE_LABELS,
  ApprovalStage,
  ApprovalTable,
} from '../../../core/api/operations.models';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { APPROVAL_STAGES, MatrixCell, formatCount } from './re-route.util';

/**
 * What the Re-Route panel shows before an approver is picked: where the pending work sits,
 * as table × level, and the three steps of a re-route.
 *
 * The grid is the old screen's Table Name and Level dropdowns turned into an answer. Those
 * dropdowns came *after* choosing a person, so nobody could see that 13,690 of the 19,644
 * pending approvals were at one table and one level. Here it is the first thing on screen,
 * and picking a cell filters the approver list to it.
 */
@Component({
  selector: 'to-re-route-overview',
  standalone: true,
  imports: [SkeletonComponent],
  templateUrl: './re-route-overview.component.html',
  styleUrl: './re-route-overview.component.scss',
})
export class ReRouteOverviewComponent {
  readonly matrix = input.required<readonly MatrixCell[][]>();
  readonly loading = input(false);
  readonly table = input<ApprovalTable | null>(null);
  readonly stage = input<ApprovalStage | null>(null);

  /** A cell was picked. The parent toggles the table + level filter. */
  readonly pick = output<MatrixCell>();

  protected readonly stages = APPROVAL_STAGES;
  protected readonly tableLabels = APPROVAL_TABLE_LABELS;
  protected readonly stageLabels = APPROVAL_STAGE_LABELS;
  protected readonly fmt = formatCount;

  protected isOn(cell: MatrixCell): boolean {
    return this.table() === cell.table && this.stage() === cell.stage;
  }

  protected hint(cell: MatrixCell): string {
    if (cell.pending === 0) {
      return 'Nothing pending';
    }
    const who = `${cell.approvers} ${cell.approvers === 1 ? 'approver' : 'approvers'}`;
    return cell.stuck > 0 ? `${who} · ${formatCount(cell.stuck)} stuck` : who;
  }
}
