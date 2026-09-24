import { Component, computed, inject } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { dec } from '../../../../core/api/api.types';
import { HeadroomBarComponent } from '../../../../shared/components/headroom-bar/headroom-bar.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { TradeOfferStore } from '../trade-offer.store';
import {
  TradeOfferStep,
  formatLitres,
  formatMoney,
  formatPeriod,
  formatPlain,
  statusLabel,
  statusPill,
} from '../trade-offer.util';

interface ProgressItem {
  step: TradeOfferStep;
  label: string;
  state: 'done' | 'todo' | 'warn' | 'locked';
  note: string;
}

/**
 * The aside: what the scheme is, what it costs, and what still stands between it and an
 * approver — each line a way to the part that needs it.
 */
@Component({
  selector: 'to-trade-offer-summary',
  standalone: true,
  imports: [TablerIconComponent, HeadroomBarComponent, StatusPillComponent],
  templateUrl: './trade-offer-summary.component.html',
  styleUrl: './trade-offer-summary.component.scss',
})
export class TradeOfferSummaryComponent {
  protected readonly store = inject(TradeOfferStore);

  protected readonly icons = ICON_REGISTRY;
  protected readonly statusLabel = statusLabel;
  protected readonly statusPill = statusPill;
  protected readonly formatMoney = formatMoney;

  protected readonly scheme = this.store.scheme;

  protected readonly title = computed(() => {
    const scheme = this.scheme();
    if (scheme) {
      return `Scheme ${scheme.sequenceId}`;
    }
    const source = this.store.copySource();
    return source ? `Copy of ${source.sequenceId}` : 'New scheme';
  });

  protected readonly period = computed(() => {
    const scheme = this.scheme();
    return scheme ? formatPeriod(scheme.fromDate, scheme.toDate) : '—';
  });

  protected readonly offer = computed(() => {
    const slab = this.store.slabFigures();
    if (!slab) {
      return null;
    }
    return {
      discount: `PKR ${formatPlain(slab.discountValue)} per ${formatLitres(slab.forEvery)}`,
      range: `${formatPlain(slab.fromQuantity)} – ${formatPlain(slab.toQuantity)} L`,
      forecast: formatLitres(slab.forecastLimit),
    };
  });

  protected readonly shell = computed(() => {
    const selected = this.store.selectedShell();
    if (selected) {
      return {
        name: selected.name || selected.shellCode,
        total: dec(selected.totalBudget),
        allocated: dec(selected.allocatedBudget),
      };
    }
    const saved = this.scheme()?.mechanics?.budgetShell;
    return saved
      ? { name: saved.name || saved.shellCode, total: dec(saved.totalBudget), allocated: dec(saved.allocatedBudget) }
      : null;
  });

  protected readonly roi = computed(() => {
    const mechanics = this.store.calculation() ?? this.scheme()?.mechanics;
    if (!mechanics) {
      return null;
    }
    const value = dec(mechanics.figures.roi);
    return { text: `${formatPlain(value)}%`, good: value > 0, bad: value < 0 };
  });

  protected readonly progress = computed<ProgressItem[]>(() => {
    const scheme = this.scheme();
    if (!scheme) {
      return [
        { step: 'setup', label: 'Setup', state: 'todo', note: 'Create the scheme' },
        { step: 'slab', label: 'Slab', state: 'locked', note: '' },
        { step: 'criteria', label: 'Criteria', state: 'locked', note: '' },
        { step: 'mechanics', label: 'Discount mechanics', state: 'locked', note: '' },
        { step: 'approval', label: 'Approval route', state: 'locked', note: '' },
      ];
    }
    const requirements = this.store.requirements();
    const criteriaMissing = [
      requirements.regionOk ? '' : requirements.regionCount > 1 ? 'only one region' : 'a region',
      requirements.masterSkuOk ? '' : 'a master SKU',
      requirements.brandOk ? '' : 'no brand',
    ].filter(Boolean);
    const mechanics = scheme.mechanics;
    const check = this.store.currentCheck();
    const sent = !scheme.isEditable;
    return [
      { step: 'setup', label: 'Setup', state: 'done', note: scheme.schemeId },
      {
        step: 'slab',
        label: 'Slab',
        state: scheme.slabs.length > 0 ? 'done' : sent ? 'locked' : 'todo',
        note: scheme.slabs.length > 0 ? '' : 'Add the slab',
      },
      {
        step: 'criteria',
        label: 'Criteria',
        state: criteriaMissing.length === 0 ? 'done' : 'warn',
        note: criteriaMissing.length === 0 ? `${scheme.criteria.length} saved` : `Needs ${criteriaMissing.join(', ')}`,
      },
      {
        step: 'mechanics',
        label: 'Discount mechanics',
        state: !mechanics ? 'todo' : this.store.outdated() || mechanics.exceedsAvailableBudget ? 'warn' : 'done',
        note: !mechanics
          ? 'Pick a shell and save'
          : this.store.outdated()
            ? 'Out of date — save again'
            : mechanics.exceedsAvailableBudget
              ? 'Exceeds the budget'
              : '',
      },
      {
        step: 'approval',
        label: 'Approval route',
        state: sent ? 'done' : check?.canSubmit ? 'done' : check ? 'warn' : 'todo',
        note: sent
          ? statusLabel(scheme.status)
          : check?.canSubmit
            ? 'Ready to send'
            : check
              ? `${check.issues.length} to fix`
              : 'Not checked yet',
      },
    ];
  });

  protected goTo(item: ProgressItem): void {
    if (item.state !== 'locked') {
      this.store.goTo(item.step);
    }
  }
}
