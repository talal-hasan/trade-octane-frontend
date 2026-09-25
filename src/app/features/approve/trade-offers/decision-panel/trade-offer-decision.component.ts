import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

import { dec, int } from '../../../../core/api/api.types';
import { ApproveTradeOfferCatalogueResponse, ApproveTradeOfferOutcome } from '../../../../core/api/approve.models';
import { ConfirmDetail, ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { StatusPillComponent, StatusPillStatus } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { waitingLabel } from '../../shared/approve-common.util';
import {
  DecisionRefusal,
  FINAL_LEVEL,
  MAX_BATCH,
  MAX_FINALS,
  SchemeRow,
  formatMoney,
  levelLabel,
  levelRole,
  ownerIssue,
  planDecision,
  postingSeconds,
  rejectRecipients,
} from '../approve-trade-offers.util';

export interface TradeOfferDecisionRequest {
  action: 'accept' | 'reject';
  /** Set for an accept that carries a level 2 scheme. */
  forwardToUserId: string | null;
}

export interface TradeOfferReceiptLine {
  seqId: string;
  outcome: ApproveTradeOfferOutcome;
  label: string;
  pill: StatusPillStatus;
  note: string;
  /** `Olpers ProCal 200ml · PKR 20,710`, from the row as it was. */
  detail: string;
  /** Still in the queue after this decision: refused by Salesflo, owner cannot receive it, … */
  stillWaiting: boolean;
}

export interface TradeOfferReceipt {
  action: TradeOfferDecisionRequest['action'];
  actedOn: number;
  skipped: number;
  lines: TradeOfferReceiptLine[];
}

/** How many ticked schemes the panel lists by id before it says "and N more". */
const LISTED = 5;

/**
 * The right-hand side of Approve → Trade Offers: legacy's Forward To dropdown (level 2 only),
 * Accept / Reject radios and Submit, plus what the page never said — where each ticked scheme
 * goes. Level 1 goes to the budget's owner by itself, level 2 to the FBP chosen here, and
 * level 3 approves, posting to Salesflo first when the scheme runs there.
 */
@Component({
  selector: 'to-trade-offer-decision',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, ButtonModule, SelectModule, ConfirmDialogComponent, StatusPillComponent],
  templateUrl: './trade-offer-decision.component.html',
  styleUrl: './trade-offer-decision.component.scss',
})
export class TradeOfferDecisionComponent {
  readonly selected = input.required<readonly SchemeRow[]>();
  /** Ticked schemes the grid's filters currently hide. */
  readonly hiddenSelected = input(0);
  readonly queue = input.required<readonly SchemeRow[]>();
  readonly catalogue = input.required<ApproveTradeOfferCatalogueResponse | null>();
  readonly callerId = input('');
  /** The Forward To remembered for this user, if any. */
  readonly rememberedForwardTo = input('');
  readonly deciding = input<TradeOfferDecisionRequest['action'] | null>(null);
  readonly receipt = input<TradeOfferReceipt | null>(null);
  readonly refusal = input<DecisionRefusal | null>(null);

  readonly decide = output<TradeOfferDecisionRequest>();
  readonly unselect = output<readonly string[]>();
  readonly clear = output<void>();
  readonly retry = output<void>();
  readonly dismissReceipt = output<void>();
  /** Ticks again the schemes a decision left waiting. */
  readonly retick = output<readonly string[]>();
  readonly view = output<string>();

  protected readonly icons = ICON_REGISTRY;
  protected readonly levelLabel = levelLabel;
  protected readonly formatMoney = formatMoney;
  protected readonly maxBatch = MAX_BATCH;
  protected readonly maxFinals = MAX_FINALS;

  /** Legacy's Accept / Reject radios; Accept was checked by default, and still is. */
  protected readonly action = signal<TradeOfferDecisionRequest['action']>('accept');
  protected readonly forwardControl = new FormControl('', { nonNullable: true });
  private readonly forwardTo = toSignal(this.forwardControl.valueChanges, { initialValue: '' });
  protected readonly confirming = signal<TradeOfferDecisionRequest['action'] | null>(null);

  protected readonly plan = computed(() => planDecision(this.selected(), this.catalogue(), this.callerId()));
  protected readonly forwardOptions = computed(() => this.catalogue()?.forwardTo ?? []);

  protected readonly listed = computed(() => this.selected().slice(0, LISTED));
  protected readonly unlisted = computed(() => Math.max(0, this.selected().length - LISTED));
  protected readonly total = computed(() => this.selected().reduce((sum, row) => sum + row.totalDiscount, 0));

  protected readonly forwardName = computed(() => {
    const id = this.forwardTo();
    const user = this.forwardOptions().find((option) => option.userId === id);
    return user ? user.fullName || user.userId : '';
  });

  /** Ticked schemes the server would skip as they stand: an owner who cannot receive, no Salesflo here. */
  protected readonly doomed = computed(() => {
    const plan = this.plan();
    return new Set([...plan.ownerProblems, ...plan.unpostable].map((row) => row.seqId));
  });

  protected readonly seconds = computed(() => postingSeconds(this.plan().salesfloFinals.length - this.plan().unpostable.length));

  /** Why Accept cannot be sent as things stand; null when it can. */
  protected readonly acceptBlocker = computed<string | null>(() => {
    const plan = this.plan();
    const count = this.selected().length;
    if (count === 0) {
      return 'Tick the schemes to approve.';
    }
    if (count > MAX_BATCH) {
      return `At most ${MAX_BATCH} schemes can be sent at once.`;
    }
    if (plan.finals.length > MAX_FINALS) {
      return `${plan.finals.length} of these are final approvals, each posted on its own; send at most ${MAX_FINALS} at once.`;
    }
    if (this.doomed().size === count) {
      return count === 1 ? 'This scheme cannot be approved as it stands.' : 'None of these can be approved as they stand.';
    }
    if (plan.toChosen.length > 0) {
      if (this.forwardOptions().length === 0) {
        return 'Nobody is set up to receive level 3 from you. Untick the level 2 schemes, or ask an administrator to check Approval Hierarchy.';
      }
      if (!this.forwardName()) {
        return 'Choose the FBP to forward the level 2 schemes to.';
      }
    }
    return null;
  });

  protected readonly rejectBlocker = computed<string | null>(() => {
    const count = this.selected().length;
    if (count === 0) {
      return 'Tick the schemes to send back.';
    }
    return count > MAX_BATCH ? `At most ${MAX_BATCH} schemes can be sent at once.` : null;
  });

  protected readonly recipients = computed(() => rejectRecipients(this.selected()));

  protected readonly submitLabel = computed(() => {
    const count = this.selected().length;
    const noun = count === 1 ? 'scheme' : `${count} schemes`;
    if (this.deciding() === 'accept') {
      return this.seconds() > 0 ? `Posting… about ${this.seconds()} s` : 'Approving…';
    }
    if (this.deciding() === 'reject') {
      return 'Rejecting…';
    }
    return this.action() === 'reject' ? `Reject ${noun}` : `Approve ${noun}`;
  });

  protected readonly rejectDetails = computed<ConfirmDetail[]>(() =>
    this.recipients().map((recipient) => ({
      label: recipient.name,
      value: recipient.count === 1 ? '1 scheme' : `${recipient.count} schemes`,
    })),
  );

  protected readonly finalDetails = computed<ConfirmDetail[]>(() => {
    const plan = this.plan();
    const posted = plan.salesfloFinals.length - plan.unpostable.length;
    const orange = plan.finals.length - plan.salesfloFinals.length;
    const details: ConfirmDetail[] = [];
    if (posted > 0) {
      details.push({ label: 'Posted to Salesflo, then approved', value: String(posted) });
    }
    if (orange > 0) {
      details.push({ label: 'Approved and copied to Orange', value: String(orange) });
    }
    const forwarded = this.selected().length - plan.finals.length - plan.ownerProblems.length;
    if (forwarded > 0) {
      details.push({ label: 'Forwarded to the next level', value: String(forwarded) });
    }
    return details;
  });

  // ─── The idle view: the approver's own queue ────────────────────────────────

  protected readonly levels = computed(() => {
    const catalogue = this.catalogue();
    const rows = this.queue();
    return (catalogue?.levels ?? []).map((entry) => {
      const level = int(entry.level);
      const waiting = rows.filter((row) => row.level === level);
      let note = '';
      let warn = '';
      if (level === 1) {
        note = 'goes to each budget owner';
      } else if (level === 2) {
        note = 'you choose the FBP';
        warn = catalogue && catalogue.forwardTo.length === 0 ? 'Nobody to forward to — these can only be rejected' : '';
      } else if (level >= FINAL_LEVEL) {
        note = 'approves; Salesflo schemes are posted first';
        warn = catalogue?.salesfloAvailable === false ? 'Salesflo posting is off on this server' : '';
      }
      return {
        level,
        role: entry.roleName || levelRole(level),
        count: waiting.length,
        discount: waiting.reduce((sum, row) => sum + row.totalDiscount, 0),
        note,
        warn,
      };
    });
  });

  protected readonly queueTotal = computed(() => this.queue().reduce((sum, row) => sum + row.totalDiscount, 0));

  protected readonly oldest = computed(() => {
    let days: number | null = null;
    for (const row of this.queue()) {
      if (row.waitingDays !== null && (days === null || row.waitingDays > days)) {
        days = row.waitingDays;
      }
    }
    return waitingLabel(days);
  });

  protected readonly catalogueTotal = computed(() => dec(this.catalogue()?.totalDiscount));

  constructor() {
    // Forward To starts on the only FBP there is, or on the one chosen last; a choice still on
    // the list is kept.
    effect(() => {
      const options = this.forwardOptions();
      const remembered = this.rememberedForwardTo();
      untracked(() => {
        const current = this.forwardControl.value;
        if (options.some((option) => option.userId === current)) {
          return;
        }
        const pick =
          options.length === 1
            ? options[0].userId
            : options.some((option) => option.userId === remembered)
              ? remembered
              : '';
        this.forwardControl.setValue(pick);
      });
    });
  }

  protected setAction(action: TradeOfferDecisionRequest['action']): void {
    this.action.set(action);
  }

  protected issueOf(row: SchemeRow): string | null {
    return ownerIssue(row, this.callerId());
  }

  protected submit(): void {
    if (this.deciding() !== null) {
      return;
    }
    if (this.action() === 'reject') {
      if (this.rejectBlocker() === null) {
        this.confirming.set('reject');
      }
      return;
    }
    if (this.acceptBlocker() !== null) {
      return;
    }
    // A final approval posts to Salesflo or copies to Orange: it goes live, so it is confirmed.
    if (this.plan().finals.length > 0) {
      this.confirming.set('accept');
      return;
    }
    this.send('accept');
  }

  protected confirmAs(action: TradeOfferDecisionRequest['action']): void {
    this.confirming.set(null);
    this.send(action);
  }

  protected untickDoomed(): void {
    this.unselect.emit([...this.doomed()]);
  }

  protected stillWaitingOf(receipt: TradeOfferReceipt): string[] {
    return receipt.lines.filter((line) => line.stillWaiting).map((line) => line.seqId);
  }

  protected receiptTitle(receipt: TradeOfferReceipt): string {
    const count = (outcome: ApproveTradeOfferOutcome) => receipt.lines.filter((line) => line.outcome === outcome).length;
    const parts: string[] = [];
    const forwarded = count('Forwarded');
    const approved = count('Approved');
    const returned = count('Rejected');
    const waiting = receipt.lines.filter((line) => line.stillWaiting).length;
    if (forwarded > 0) {
      parts.push(`${forwarded} forwarded`);
    }
    if (approved > 0) {
      parts.push(`${approved} approved`);
    }
    if (returned > 0) {
      parts.push(`${returned} sent back`);
    }
    if (waiting > 0) {
      parts.push(`${waiting} still waiting`);
    }
    const gone = receipt.skipped - waiting;
    if (gone > 0) {
      parts.push(`${gone} skipped`);
    }
    return parts.length > 0 ? parts.join(' · ') : 'Nothing was changed';
  }

  private send(action: TradeOfferDecisionRequest['action']): void {
    this.decide.emit({
      action,
      forwardToUserId: action === 'accept' && this.plan().toChosen.length > 0 ? this.forwardControl.value : null,
    });
  }
}
