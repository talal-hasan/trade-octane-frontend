import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

import { dec } from '../../../../core/api/api.types';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ApprovalChainComponent } from '../../../../shared/components/approval-chain/approval-chain.component';
import { ConfirmDialogComponent, ConfirmDetail } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { TradeOffersApi } from '../../services/trade-offers.api';
import { TradeOfferStore } from '../trade-offer.store';
import {
  STEP_LABELS,
  TradeOfferRefusal,
  TradeOfferStep,
  approvalChainOf,
  formatDateTime,
  formatMoney,
  formatPeriod,
  isStaleScheme,
  notificationNote,
  readPreference,
  refusalOf,
  stepOfIssue,
  writePreference,
} from '../trade-offer.util';

interface ReadinessItem {
  label: string;
  ok: boolean;
  step: TradeOfferStep;
}

/**
 * 5 · Approval Route — legacy's Check for Approval, Forward To and Send for Approval.
 *
 * Legacy showed the first reason a scheme could not be sent, and Send re-checked nothing.
 * Here every reason is listed with a way to it, the check runs by itself once everything
 * this screen can see is in place, and the server re-runs it on send.
 */
@Component({
  selector: 'to-trade-offer-approval-card',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, ButtonModule, SelectModule, ApprovalChainComponent, ConfirmDialogComponent],
  templateUrl: './approval-card.component.html',
  styleUrl: './approval-card.component.scss',
})
export class ApprovalCardComponent {
  protected readonly store = inject(TradeOfferStore);
  private readonly api = inject(TradeOffersApi);
  private readonly notifications = inject(NotificationService);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly stepLabels = STEP_LABELS;
  protected readonly formatDateTime = formatDateTime;

  protected readonly locked = this.store.isNew;
  protected readonly editable = this.store.editable;

  protected readonly forwardTo = new FormControl('', { nonNullable: true });
  protected readonly forwardToValue = signal('');

  protected readonly check = this.store.currentCheck;

  protected readonly issues = computed(() =>
    (this.check()?.issues ?? []).map((issue) => ({ ...issue, step: stepOfIssue(issue.code) })),
  );

  protected readonly approvers = computed(() =>
    [...(this.check()?.approvers ?? [])].sort((a, b) => (a.fullName || a.userId).localeCompare(b.fullName || b.userId)),
  );

  protected readonly approverName = computed(() => {
    const id = this.forwardToValue();
    const approver = this.approvers().find((candidate) => candidate.userId === id);
    return approver ? approver.fullName || approver.userId : '';
  });

  /** What this screen can already see, before the server is asked. */
  protected readonly readiness = computed<ReadinessItem[]>(() => {
    const requirements = this.store.requirements();
    const mechanics = this.store.scheme()?.mechanics;
    return [
      { label: 'The slab is saved', ok: !!this.store.slab(), step: 'slab' },
      { label: 'Exactly one region', ok: requirements.regionOk, step: 'criteria' },
      { label: 'At least one master SKU', ok: requirements.masterSkuOk, step: 'criteria' },
      { label: 'No brand criterion', ok: requirements.brandOk, step: 'criteria' },
      {
        label: 'Discount mechanics saved, and matching the slab',
        ok: !!mechanics && !this.store.outdated() && !mechanics.exceedsAvailableBudget,
        step: 'mechanics',
      },
    ];
  });

  protected readonly chain = computed(() => {
    const scheme = this.store.scheme();
    return scheme && scheme.approvalSteps.length > 0 ? approvalChainOf(scheme) : null;
  });

  protected readonly confirming = signal(false);
  protected readonly sending = signal(false);
  protected readonly refusal = signal<TradeOfferRefusal | null>(null);
  protected readonly forwardToReason = signal<'remembered' | 'only' | null>(null);

  protected readonly confirmDetails = computed<ConfirmDetail[]>(() => {
    const scheme = this.store.scheme();
    if (!scheme) {
      return [];
    }
    const mechanics = scheme.mechanics;
    return [
      { label: 'Scheme', value: `${scheme.sequenceId} · ${scheme.schemeId}` },
      { label: 'Period', value: formatPeriod(scheme.fromDate, scheme.toDate) },
      { label: 'Total discount', value: mechanics ? formatMoney(dec(mechanics.figures.totalDiscount)) : '—' },
      { label: 'Budget shell', value: mechanics?.budgetShell?.name || mechanics?.budgetShellCode || '—' },
      { label: 'Forward to', value: this.approverName() || this.forwardToValue() },
    ];
  });

  constructor() {
    this.forwardTo.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.forwardToValue.set(value);
      this.forwardToReason.set(null);
      this.refusal.set(null);
    });

    // Forward To: the approver this user sent to last time, or the only one there is.
    effect(() => {
      const approvers = this.approvers();
      untracked(() => {
        const ids = new Set(approvers.map((approver) => approver.userId));
        if (this.forwardTo.value && ids.has(this.forwardTo.value)) {
          return;
        }
        const remembered = readPreference(this.menuAccess.userId(), 'forwardTo');
        const pick = ids.has(remembered) ? remembered : approvers.length === 1 ? approvers[0].userId : '';
        this.forwardTo.setValue(pick, { emitEvent: false });
        this.forwardToValue.set(pick);
        this.forwardToReason.set(pick ? (pick === remembered ? 'remembered' : 'only') : null);
      });
    });

    effect(() => {
      const enabled = this.editable() && !this.locked();
      untracked(() => (enabled ? this.forwardTo.enable({ emitEvent: false }) : this.forwardTo.disable({ emitEvent: false })));
    });
  }

  protected goTo(step: TradeOfferStep | null): void {
    if (step) {
      this.store.goTo(step);
    }
  }

  protected askSend(): void {
    if (!this.check()?.canSubmit || !this.forwardToValue() || this.sending()) {
      return;
    }
    this.confirming.set(true);
  }

  protected send(): void {
    const sequenceId = this.store.sequenceId();
    const forwardTo = this.forwardToValue();
    this.confirming.set(false);
    if (!sequenceId || !forwardTo) {
      return;
    }
    this.sending.set(true);
    this.refusal.set(null);
    this.api
      .submit(sequenceId, forwardTo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.sending.set(false);
          writePreference(this.menuAccess.userId(), 'forwardTo', forwardTo);
          this.store.apply(response.scheme);
          this.store.submitted.set(response);
          const name = response.forwardedTo.fullName || response.forwardedTo.userId;
          this.notifications.success(`Scheme ${sequenceId} sent to ${name} for approval.`, 'Sent');
        },
        error: (error: unknown) => {
          this.sending.set(false);
          const refused = refusalOf(error, 'The scheme could not be sent.');
          this.refusal.set(refused);
          if (isStaleScheme(refused)) {
            this.store.reload();
          } else {
            // The scheme or the approvers changed since the check: ask again.
            this.store.runCheck();
          }
        },
      });
  }

  protected receiptNote(): string {
    const receipt = this.store.submitted();
    if (!receipt) {
      return '';
    }
    return notificationNote(receipt.approverNotification, receipt.forwardedTo.fullName || receipt.forwardedTo.userId);
  }

  protected startNew(copy: boolean): void {
    const source = copy ? this.store.scheme() : null;
    this.store.startNew(source);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
    queueMicrotask(() => this.store.goTo('setup'));
  }
}
