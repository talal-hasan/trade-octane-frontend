import { Component, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';

import { ICON_REGISTRY } from '../../icon-registry';
import { RelativeDatePipe } from '../../pipes/relative-date.pipe';

export type ApprovalStepStatus = 'approved' | 'pending' | 'rejected' | 'waiting';

export interface ApprovalStep {
  role: string;
  name: string;
  status: ApprovalStepStatus;
  timestamp?: Date | string;
  remarks?: string;
}

const STATUS_LABELS: Record<ApprovalStepStatus, string> = {
  approved: 'Approved',
  pending: 'Pending',
  rejected: 'Rejected',
  waiting: 'Waiting',
};

// The single reusable approval chain used across Budget, Scheme, Promotion and Claims
// (CLAUDE.md §8). The `@Input()`/plain-fields shape shown in CLAUDE.md predates this
// codebase's Angular 21 signal convention — translated here to `input()`/`output()` to
// stay consistent with the rest of the app.
@Component({
  selector: 'to-approval-chain',
  standalone: true,
  imports: [TablerIconComponent, ButtonModule, TextareaModule, ReactiveFormsModule, RelativeDatePipe],
  templateUrl: './approval-chain.component.html',
  styleUrl: './approval-chain.component.scss',
})
export class ApprovalChainComponent {
  readonly steps = input.required<ApprovalStep[]>();
  readonly currentStepIndex = input.required<number>();
  readonly canApprove = input<boolean>(false);

  readonly approve = output<{ stepIndex: number; remarks: string }>();
  readonly reject = output<{ stepIndex: number; remarks: string }>();

  protected readonly checkIcon = ICON_REGISTRY['check'];
  protected readonly xIcon = ICON_REGISTRY['x'];
  protected readonly clockIcon = ICON_REGISTRY['clock'];
  protected readonly statusLabels = STATUS_LABELS;

  // Single shared control for the current step's inline remarks box. Remarks are
  // required before reject, optional before approve — a reasonable enterprise-approval
  // default (most approval flows don't force a reason to approve, but always want one
  // recorded against a rejection).
  protected readonly remarksControl = new FormControl('', { nonNullable: true });
  protected readonly rejectBlocked = signal(false);

  protected absoluteLabel(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(
      date,
    );
  }

  protected onApprove(stepIndex: number): void {
    this.approve.emit({ stepIndex, remarks: this.remarksControl.value.trim() });
    this.resetRemarks();
  }

  protected onReject(stepIndex: number): void {
    const remarks = this.remarksControl.value.trim();
    if (!remarks) {
      this.rejectBlocked.set(true);
      return;
    }
    this.reject.emit({ stepIndex, remarks });
    this.resetRemarks();
  }

  private resetRemarks(): void {
    this.remarksControl.setValue('');
    this.rejectBlocked.set(false);
  }
}
