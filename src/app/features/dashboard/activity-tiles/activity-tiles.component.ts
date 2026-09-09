import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ApiClient } from '../../../core/api/api-client.service';
import { unwrapData } from '../../../core/api/api.types';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';

/**
 * `GET /api/v1/dashboard/tiles`.
 *
 * Every figure is a **string** on the wire — the contract declares all sixteen as
 * `"type": "string"`, not as integers. They are parsed here rather than rendered raw so
 * they can be formatted with thousands separators and so a missing value shows as a dash
 * instead of the word "null".
 */
interface DashboardTilesResponse {
  totalActivities: string;
  tradeOfferActivityRaised: string;
  spendProposalActivityRaised: string;
  brdActivitiesRaised: string;
  inTradeOctaneOpen: string;
  inTradeOctaneClosed: string;
  tradeOfferOpen: string;
  tradeOfferClosed: string;
  spendProposalOpen: string;
  spendProposalClosed: string;
  brdOpen: string;
  brdClosed: string;
  olpers: string;
  tarang: string;
  dairyOmung: string;
  others: string;
}

interface Tile {
  label: string;
  value: string;
  icon: string;
}

interface OpenClosedRow {
  label: string;
  open: string;
  closed: string;
  /** Share of the row that is closed, 0–1. Drives the bar. */
  closedShare: number;
}

/**
 * The activity tiles the legacy portal shows after sign-in, sourced from the real API.
 *
 * This exists because the rest of the dashboard is gated on the POC's invented permission
 * strings, which are empty against the live backend — so a real signed-in administrator
 * saw "Nothing assigned to you yet" on a working system. These tiles are gated on nothing:
 * the endpoint already scopes its figures to the caller.
 */
@Component({
  selector: 'to-activity-tiles',
  standalone: true,
  imports: [TablerIconComponent, SkeletonComponent],
  templateUrl: './activity-tiles.component.html',
  styleUrl: './activity-tiles.component.scss',
})
export class ActivityTilesComponent {
  private readonly api = inject(ApiClient);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly skeletons = [0, 1, 2, 3];

  private readonly data = signal<DashboardTilesResponse | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .get<DashboardTilesResponse | { data: DashboardTilesResponse }>('/dashboard/tiles')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.data.set(unwrapData(response));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected retry(): void {
    this.load();
  }

  /** Parses a wire figure; returns null when it is absent or not a number. */
  private num(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private fmt(value: string | null | undefined): string {
    const parsed = this.num(value);
    return parsed === null ? '—' : parsed.toLocaleString('en-PK');
  }

  /** Headline counts — what was raised, and of what kind. */
  protected readonly raised = computed<Tile[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    return [
      { label: 'Total activities', value: this.fmt(d.totalActivities), icon: 'chart-bar' },
      { label: 'Trade offers', value: this.fmt(d.tradeOfferActivityRaised), icon: 'discount-2' },
      { label: 'Spend proposals', value: this.fmt(d.spendProposalActivityRaised), icon: 'wallet' },
      { label: 'BRD activities', value: this.fmt(d.brdActivitiesRaised), icon: 'file-invoice' },
    ];
  });

  /**
   * Open against closed, per stream.
   *
   * Paired rather than shown as eight separate tiles: open and closed are only meaningful
   * relative to each other, and eight bare integers would say less than four ratios.
   */
  protected readonly openClosed = computed<OpenClosedRow[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    const row = (label: string, open: string, closed: string): OpenClosedRow => {
      const openN = this.num(open) ?? 0;
      const closedN = this.num(closed) ?? 0;
      const total = openN + closedN;
      return {
        label,
        open: this.fmt(open),
        closed: this.fmt(closed),
        closedShare: total === 0 ? 0 : closedN / total,
      };
    };
    return [
      row('In Trade Octane', d.inTradeOctaneOpen, d.inTradeOctaneClosed),
      row('Trade offer', d.tradeOfferOpen, d.tradeOfferClosed),
      row('Spend proposal', d.spendProposalOpen, d.spendProposalClosed),
      row('BRD', d.brdOpen, d.brdClosed),
    ];
  });

  /**
   * Brand split.
   *
   * The four brands are named in the contract itself (`olpers`, `tarang`, `dairyOmung`,
   * `others`) rather than returned as a list, so they are hardcoded here to match. If the
   * brand set ever changes, this endpoint's shape changes with it.
   */
  protected readonly brands = computed<Tile[]>(() => {
    const d = this.data();
    if (!d) {
      return [];
    }
    return [
      { label: 'Olpers', value: this.fmt(d.olpers), icon: 'tag' },
      { label: 'Tarang', value: this.fmt(d.tarang), icon: 'tag' },
      { label: 'Dairy Omung', value: this.fmt(d.dairyOmung), icon: 'tag' },
      { label: 'Others', value: this.fmt(d.others), icon: 'tag' },
    ];
  });

  /** True when the call succeeded but every figure was blank. */
  protected readonly isEmpty = computed(() => {
    const d = this.data();
    if (!d) {
      return false;
    }
    return Object.values(d).every((value) => this.num(value) === null);
  });
}
