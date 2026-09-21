import { Component, computed, input, output } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';

import { ICON_REGISTRY } from '../../../shared/icon-registry';
import {
  RunLineState,
  RunState,
  candidateLabel,
  formatCount,
  queueLabel,
  runMoved,
} from './re-route.util';

/**
 * The outcome of a re-route, queue by queue — shown while it runs and until dismissed.
 *
 * Legacy printed "RE-ROUTE SCHEMES UPDATED.." whatever happened: it discarded the DAL's
 * return value, so a moved queue, a syntax error and a deadlock all read the same. Here each
 * queue says what it did — how many moved, or why nothing did — and what moved is listed.
 */
@Component({
  selector: 'to-re-route-receipt',
  standalone: true,
  imports: [TablerIconComponent, ButtonModule],
  templateUrl: './re-route-receipt.component.html',
  styleUrl: './re-route-receipt.component.scss',
})
export class ReRouteReceiptComponent {
  readonly run = input.required<RunState>();

  /** Open the approver the work went to. */
  readonly openRecipient = output<void>();
  /** Back to the approver the work came from. */
  readonly dismiss = output<void>();

  protected readonly icons = ICON_REGISTRY;
  protected readonly fmt = formatCount;
  protected readonly queueLabel = queueLabel;

  protected readonly moved = computed(() => runMoved(this.run()));
  protected readonly recipient = computed(() => candidateLabel(this.run().to));
  protected readonly allMoved = computed(() => this.run().lines.every((line) => line.state === 'moved'));

  protected readonly current = computed(() => {
    const lines = this.run().lines;
    return lines.filter((line) => line.state !== 'waiting').length || 1;
  });

  protected readonly movedKeys = computed(() =>
    this.run().lines.flatMap((line) => line.movedKeys.map((key) => ({ label: queueLabel(line), key }))),
  );

  /** The server returns at most 500 moved keys per queue, and says when it stopped there. */
  protected readonly keysTruncated = computed(() => this.run().lines.some((line) => line.keysTruncated));

  protected readonly markIcon = computed(() =>
    !this.run().done ? 'refresh' : this.moved() > 0 ? 'circle-check' : 'alert-triangle',
  );

  protected lineIcon(state: RunLineState): string {
    switch (state) {
      case 'moved':
        return 'circle-check';
      case 'changed':
        return 'alert-triangle';
      case 'failed':
        return 'circle-x';
      case 'moving':
        return 'refresh';
      case 'waiting':
        return 'clock';
    }
  }
}
