import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

import { int } from '../../../../core/api/api.types';
import { ApproveBudgetCatalogueResponse, ApproveBudgetOutcome } from '../../../../core/api/approve.models';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { ConfirmDetail, ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusPillComponent, StatusPillStatus } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { PkrCurrencyPipe } from '../../../../shared/pipes/pkr-currency.pipe';
import {
  BudgetRow,
  DecisionRefusal,
  FINAL_LEVEL,
  MAX_BATCH,
  defaultForwardTo,
  forwardPreferenceKey,
  levelLabel,
  planForward,
  readPreference,
  rejectRecipients,
  waitingLabel,
} from '../approve-budgets.util';

export interface DecisionRequest {
  action: 'accept' | 'reject';
  /** Set for an accept that forwards at least one budget. */
  forwardToUserId: string | null;
}

export interface DecisionReceiptLine {
  shellCode: string;
  outcome: ApproveBudgetOutcome;
  label: string;
  pill: StatusPillStatus;
  note: string;
  amount: number | null;
  /** `Lahore · Sep 2026`, from the row as it was; empty for a code the queue did not hold. */
  detail: string;
}

export interface DecisionReceipt {
  action: DecisionRequest['action'];
  actedOn: number;
  skipped: number;
  decidedOn: string | null;
  lines: DecisionReceiptLine[];
}

/** How many ticked budgets the panel lists by name before it says "and N more". */
const LISTED = 5;

/**
 * The right-hand side of Approve → Budgets: legacy's Forward To dropdown, Accept / Reject
 * radios and Submit, plus what the page never said — what the click will do.
 *
 * With nothing ticked it describes the approver's own queue: the levels they sign at, and any
 * level nobody is set up to receive from them. With budgets ticked it states the plan; after
 * a submit it is the receipt.
 */
@Component({
  selector: 'to-approve-decision',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    SelectModule,
    ConfirmDialogComponent,
    StatusPillComponent,
    PkrCurrencyPipe,
  ],
  templateUrl: './decision-panel.component.html',
  styleUrl: './decision-panel.component.scss',
})
export class DecisionPanelComponent {
  readonly selected = input.required<readonly BudgetRow[]>();
  /** Ticked budgets the grid's filters currently hide. */
  readonly hiddenSelected = input(0);
  readonly queue = input.required<readonly BudgetRow[]>();
  readonly catalogue = input.required<ApproveBudgetCatalogueResponse | null>();
  readonly deciding = input<DecisionRequest['action'] | null>(null);
  readonly receipt = input<DecisionReceipt | null>(null);
  readonly refusal = input<DecisionRefusal | null>(null);

  readonly decide = output<DecisionRequest>();
  readonly unselect = output<string>();
  readonly clear = output<void>();
  readonly retry = output<void>();
  readonly dismissReceipt = output<void>();

  private readonly menuAccess = inject(MenuAccessService);

  protected readonly icons = ICON_REGISTRY;
  protected readonly levelLabel = levelLabel;
  protected readonly maxBatch = MAX_BATCH;

  /** Legacy's Accept / Reject radios; Accept was checked by default, and still is. */
  protected readonly action = signal<DecisionRequest['action']>('accept');
  protected readonly forwardControl = new FormControl('', { nonNullable: true });
  private readonly forwardTo = toSignal(this.forwardControl.valueChanges, { initialValue: '' });
  protected readonly confirmingReject = signal(false);

  protected readonly plan = computed(() => planForward(this.selected(), this.catalogue()));

  protected readonly listed = computed(() => this.selected().slice(0, LISTED));
  protected readonly unlisted = computed(() => Math.max(0, this.selected().length - LISTED));
  protected readonly total = computed(() => this.selected().reduce((sum, row) => sum + row.amount, 0));
  protected readonly overLimit = computed(() => this.selected().length > MAX_BATCH);

  protected readonly forwardName = computed(() => {
    const id = this.forwardTo();
    return this.plan().options.find((option) => option.userId === id)?.fullName ?? '';
  });

  /** Why Accept cannot be sent as things stand; null when it can. */
  protected readonly acceptBlocker = computed<string | null>(() => {
    const plan = this.plan();
    if (this.selected().length === 0) {
      return 'Tick the budgets to approve.';
    }
    if (this.overLimit()) {
      return `At most ${MAX_BATCH} budgets can be sent at once.`;
    }
    if (plan.forwarding.length === 0) {
      return null;
    }
    if (plan.unrouted.length > 0) {
      const first = plan.unrouted[0];
      return `Nobody is set up to receive ${first.typeName} budgets after level ${first.level} from you. Reject them, or ask an administrator to check Approval Hierarchy.`;
    }
    if (plan.noCommonApprover) {
      return 'No single approver can take every ticked budget: they go to different people. Approve one budget type at a time.';
    }
    const chosen = plan.options.find((option) => option.userId === this.forwardTo());
    if (!chosen) {
      return 'Choose who to forward to.';
    }
    return chosen.disabledReason ? `${chosen.fullName} cannot approve a budget they raised.` : null;
  });

  protected readonly rejectBlocker = computed<string | null>(() => {
    if (this.selected().length === 0) {
      return 'Tick the budgets to send back.';
    }
    return this.overLimit() ? `At most ${MAX_BATCH} budgets can be sent at once.` : null;
  });

  protected readonly recipients = computed(() => rejectRecipients(this.selected()));

  protected readonly submitLabel = computed(() => {
    const count = this.selected().length;
    const noun = count === 1 ? 'budget' : `${count} budgets`;
    if (this.deciding() === 'accept') {
      return 'Approving…';
    }
    if (this.deciding() === 'reject') {
      return 'Rejecting…';
    }
    if (this.action() === 'reject') {
      return `Reject ${noun}`;
    }
    return this.plan().forwarding.length > 0 ? `Approve & forward ${noun}` : `Approve ${noun}`;
  });

  protected readonly rejectDetails = computed<ConfirmDetail[]>(() =>
    this.recipients().map((recipient) => ({
      label: recipient.name,
      value: recipient.count === 1 ? '1 budget' : `${recipient.count} budgets`,
    })),
  );

  // ─── The idle view: the approver's own queue ────────────────────────────────

  protected readonly levels = computed(() => {
    const rows = this.queue();
    return (this.catalogue()?.budgetTypes ?? []).flatMap((type) =>
      type.levels.map((level) => {
        const number = int(level.level);
        return {
          key: `${type.schemeGroupKey}|${number}`,
          typeName: type.name || type.schemeGroupKey,
          level: number,
          roleName: level.roleName,
          waiting: rows.filter((row) => row.schemeGroupKey === type.schemeGroupKey && row.level === number).length,
          unrouted: number < FINAL_LEVEL && level.forwardTo.length === 0,
        };
      }),
    );
  });

  protected readonly queueTotal = computed(() => this.queue().reduce((sum, row) => sum + row.amount, 0));

  protected readonly oldest = computed(() => {
    let days: number | null = null;
    for (const row of this.queue()) {
      if (row.waitingDays !== null && (days === null || row.waitingDays > days)) {
        days = row.waitingDays;
      }
    }
    return days === null ? '—' : waitingLabel(days);
  });

  constructor() {
    // Starts Forward To on the only person who can take the selection, or on whoever was
    // chosen last for its types and levels. A choice the new selection still allows is kept.
    effect(() => {
      const plan = this.plan();
      untracked(() => {
        const current = this.forwardControl.value;
        if (plan.options.some((option) => option.userId === current && option.disabledReason === null)) {
          return;
        }
        const userId = this.menuAccess.userId();
        const remembered = plan.forwarding.map((row) =>
          readPreference(userId, forwardPreferenceKey(row.schemeGroupKey, row.level)),
        );
        this.forwardControl.setValue(defaultForwardTo(plan, remembered));
      });
    });
  }

  protected setAction(action: DecisionRequest['action']): void {
    this.action.set(action);
  }

  protected submit(): void {
    if (this.deciding() !== null) {
      return;
    }
    if (this.action() === 'reject') {
      if (this.rejectBlocker() === null) {
        this.confirmingReject.set(true);
      }
      return;
    }
    if (this.acceptBlocker() !== null) {
      return;
    }
    this.decide.emit({
      action: 'accept',
      forwardToUserId: this.plan().forwarding.length > 0 ? this.forwardControl.value : null,
    });
  }

  protected confirmReject(): void {
    this.confirmingReject.set(false);
    this.decide.emit({ action: 'reject', forwardToUserId: null });
  }

  protected receiptTitle(receipt: DecisionReceipt): string {
    const count = (outcome: ApproveBudgetOutcome) => receipt.lines.filter((line) => line.outcome === outcome).length;
    const parts: string[] = [];
    const forwarded = count('Forwarded');
    const approved = count('Approved');
    const returned = count('Rejected');
    if (forwarded > 0) {
      parts.push(`${forwarded} forwarded`);
    }
    if (approved > 0) {
      parts.push(`${approved} approved`);
    }
    if (returned > 0) {
      parts.push(`${returned} sent back`);
    }
    if (receipt.skipped > 0) {
      parts.push(`${receipt.skipped} skipped`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Nothing was changed';
  }
}
