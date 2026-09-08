import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';

import { FormatService } from '../../core/services/format.service';
import { PermissionService } from '../../core/services/permission.service';
import { BarChartComponent } from '../../shared/components/bar-chart/bar-chart.component';
import { DonutChartComponent } from '../../shared/components/donut-chart/donut-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SegmentedMeterComponent } from '../../shared/components/segmented-meter/segmented-meter.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { StatTileComponent } from '../../shared/components/stat-tile/stat-tile.component';
import { TrendChartComponent } from '../../shared/components/trend-chart/trend-chart.component';
import { ICON_REGISTRY } from '../../shared/icon-registry';
import { BudgetService } from '../budget/services/budget.service';
import { BudgetRecord } from '../budget/models/budget.model';
import { ClaimsService } from '../claims/services/claims.service';
import { SchemesService } from '../schemes/services/schemes.service';
import { ApprovalsService } from '../workspace/services/approvals.service';
import { ApprovalInboxItem } from '../workspace/models/approval-item.model';
import { AttentionItem, DashboardCharts, DashboardTile } from './models/dashboard.model';
import { DashboardService } from './services/dashboard.service';

/** Days a pending item may sit before it counts as breaching the internal SLA. */
const SLA_DAYS = 5;

/** Window, in days, within which an upcoming scheme expiry is worth surfacing. */
const EXPIRY_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS);
}

// Dashboard = the landing page. Read-only overview: what is pending, what is off-track,
// nothing else. Every tile and row drills into the workspace that owns the record —
// the Dashboard never edits, approves or filters anything itself.
//
// Rebuilt 2026-08-20 against the client's reference mock. The first pass used four
// full-width cards carrying one number and a caption each; that was most of the viewport
// for four facts. This version is denser on every axis:
//
//   · Compact stat tiles (~84px) in a 2×2 block, each with a period-over-period delta —
//     four now fit in less space than one old card, and each says more.
//   · A utilisation hero: headline committed spend, a segmented composition meter, and a
//     breakdown row per region with its own movement. Modelled on the mock's "Highlights".
//   · A trend line, because "67 approvals cleared" only means something against the six
//     months behind it.
//   · Needs-attention as a proper table with a brand-tinted header, not stacked cards.
//
// Two rules still drive the whole screen:
//
//  1. It shows only what this user is allowed to see. Tiles, charts and attention rows
//     are filtered on permission against PermissionService, and chart aggregates are
//     scoped to the user's regions/brands (KT: "Reports & Dashboard — role-specific,
//     users see only their hierarchy/region").
//  2. Counts come from the same live stores the workspaces read, never a parallel summary
//     endpoint. Approving a claim in the workspace decrements the tile here with no
//     refetch. A dashboard that disagrees with the screen it links to is worse than none.
@Component({
  selector: 'to-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    TablerIconComponent,
    ButtonModule,
    PageHeaderComponent,
    StatTileComponent,
    TrendChartComponent,
    SegmentedMeterComponent,
    BarChartComponent,
    DonutChartComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboardService = inject(DashboardService);
  private readonly approvalsService = inject(ApprovalsService);
  private readonly claimsService = inject(ClaimsService);
  private readonly schemesService = inject(SchemesService);
  private readonly budgetService = inject(BudgetService);
  private readonly permissionService = inject(PermissionService);
  private readonly format = inject(FormatService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly skeletonTiles = Array.from({ length: 4 }, (_, i) => i);

  private readonly charts = signal<DashboardCharts | null>(null);
  private readonly attentionItems = signal<AttentionItem[]>([]);
  private readonly approvalItems = signal<ApprovalInboxItem[]>([]);
  private readonly budgets = signal<BudgetRecord[]>([]);

  protected readonly userName = computed(() => this.permissionService.context().name);
  protected readonly scopeSummary = computed(() => {
    const context = this.permissionService.context();
    const regions = context.regions.length;
    const brands = context.brands.length;
    const regionText = regions === 1 ? context.regions[0] : `${regions} regions`;
    const brandText = brands === 1 ? context.brands[0] : `${brands} brands`;
    return `${regionText} · ${brandText}`;
  });

  // ─── Live counts, derived from the same stores the workspaces read ────────────
  private readonly pendingClaims = computed(() =>
    this.claimsService.claims().filter((claim) => claim.status === 'pending'),
  );

  private readonly overdueClaims = computed(() =>
    this.claimsService
      .claims()
      .filter((claim) => claim.status === 'overdue' || daysSince(claim.createdAt) > SLA_DAYS),
  );

  private readonly expiringSchemes = computed(() =>
    this.schemesService.schemes().filter((scheme) => {
      if (scheme.status !== 'active') {
        return false;
      }
      const remaining = daysUntil(scheme.expiryDate);
      return remaining >= 0 && remaining <= EXPIRY_WINDOW_DAYS;
    }),
  );

  private readonly pendingBudgets = computed(() =>
    this.budgets().filter((budget) => budget.status === 'pending'),
  );

  /** True when this user can approve anything at all. */
  private readonly isApprover = computed(() =>
    ['BUDGET_APPROVE', 'SCHEME_APPROVE', 'CLAIMS_APPROVE'].some((permission) =>
      this.permissionService.canAccess(permission),
    ),
  );

  /**
   * What is on this user's desk.
   *
   * For an approver this counts only items they can actually decide — an item they can
   * see but not act on is not "awaiting their approval", and counting it would send them
   * to the workspace to find nothing to do. For everyone else (a distributor, say, who
   * raises claims but approves none) the same tile counts open items in their scope
   * instead, and relabels accordingly.
   */
  private readonly deskCount = computed(() => {
    const pendingClaims = this.pendingClaims().length;
    if (!this.isApprover()) {
      return pendingClaims;
    }
    const actionable = this.approvalItems().filter((item) =>
      this.permissionService.canAccess(item.requiredPermission),
    ).length;
    const claims = this.permissionService.canAccess('CLAIMS_APPROVE') ? pendingClaims : 0;
    return actionable + claims;
  });

  // ─── Tiles ────────────────────────────────────────────────────────────────────
  // Deltas are mock figures on the POC. When the real API lands they come from the same
  // aggregate call as the charts — the shape is already in DashboardService.
  private readonly allTiles = computed<DashboardTile[]>(() => {
    const breaching = this.overdueClaims().length;
    const expiring = this.expiringSchemes().length;

    return [
      {
        key: 'approvals',
        label: this.isApprover() ? 'Awaiting my approval' : 'My open items',
        value: this.deskCount(),
        icon: 'inbox',
        tone: 'accent',
        delta: { percent: 12, direction: 'down', comparedTo: 'vs last week', good: true },
        requiredAnyOf: ['BUDGET_VIEW', 'SCHEME_VIEW', 'CLAIMS_VIEW'],
        route: '/workspace',
      },
      {
        key: 'budgets',
        label: 'Budgets pending',
        value: this.pendingBudgets().length,
        icon: 'wallet',
        tone: 'neutral',
        delta: { percent: 8, direction: 'up', comparedTo: 'vs last week', good: false },
        requiredAnyOf: ['BUDGET_VIEW'],
        route: '/budget',
      },
      {
        key: 'expiring',
        label: 'Schemes expiring',
        value: expiring,
        icon: 'clock',
        tone: expiring > 0 ? 'warning' : 'neutral',
        delta: { percent: 0, direction: 'flat', comparedTo: 'vs last week', good: true },
        requiredAnyOf: ['SCHEME_VIEW'],
        route: '/schemes',
      },
      {
        key: 'breaching',
        label: 'Claims past SLA',
        value: breaching,
        icon: 'alert-triangle',
        tone: breaching > 0 ? 'critical' : 'success',
        delta: { percent: 33, direction: 'down', comparedTo: 'vs last week', good: true },
        requiredAnyOf: ['CLAIMS_VIEW'],
        route: '/claims',
      },
    ];
  });

  protected readonly tiles = computed(() =>
    this.allTiles().filter((tile) =>
      tile.requiredAnyOf.some((permission) => this.permissionService.canAccess(permission)),
    ),
  );

  // ─── Utilisation hero ─────────────────────────────────────────────────────────
  protected readonly utilisation = computed(() =>
    this.permissionService.canAccess('BUDGET_VIEW') ? (this.charts()?.utilisation ?? null) : null,
  );

  protected readonly utilisationHeadline = computed(() => {
    const panel = this.utilisation();
    return panel ? this.format.formatPkrCompact(panel.committed) : '';
  });

  protected readonly utilisationAllocated = computed(() => {
    const panel = this.utilisation();
    return panel ? this.format.formatPkrCompact(panel.allocated) : '';
  });

  /** Percentage of allocation committed, for the "x% of allocation" caption. */
  protected readonly utilisationPercent = computed(() => {
    const panel = this.utilisation();
    if (!panel || panel.allocated === 0) {
      return '';
    }
    return this.format.formatPercent((panel.committed / panel.allocated) * 100);
  });

  /** True when committed spend has passed the approved allocation. */
  protected readonly isOverrun = computed(() => {
    const panel = this.utilisation();
    return panel ? panel.committed > panel.allocated : false;
  });

  // ─── Charts, each gated on the permission that owns its subject ───────────────
  protected readonly volumeByBrand = computed(() =>
    this.permissionService.canAccess('SCHEME_VIEW') ? (this.charts()?.volumeByBrand ?? []) : null,
  );

  protected readonly schemeMix = computed(() =>
    this.permissionService.canAccess('SCHEME_VIEW') ? (this.charts()?.schemeMix ?? []) : null,
  );

  protected readonly approvalsCleared = computed(() => this.charts()?.approvalsCleared ?? []);

  protected readonly attention = computed(() =>
    this.attentionItems().filter((item) =>
      this.permissionService.canAccess(item.requiredPermission),
    ),
  );

  /** True when this user's permissions leave nothing on the page worth rendering. */
  protected readonly isEmpty = computed(
    () => this.tiles().length === 0 && this.attention().length === 0,
  );

  constructor() {
    this.load();
  }

  protected retry(): void {
    this.load();
  }

  protected formatPkr(value: number): string {
    return this.format.formatPkrCompact(value);
  }

  protected deltaClassFor(good: boolean, direction: string): string {
    if (direction === 'flat') {
      return 'flat';
    }
    return good ? 'good' : 'bad';
  }

  protected deltaIconFor(direction: string) {
    if (direction === 'flat') {
      return ICON_REGISTRY['minus'];
    }
    return direction === 'up' ? ICON_REGISTRY['trending-up'] : ICON_REGISTRY['trending-down'];
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);

    const context = this.permissionService.context();

    // Fire everything in parallel and let each result land independently. A failure in
    // one aggregate should degrade that card, not blank the whole landing page — so only
    // the charts call flips the page-level error state.
    this.dashboardService
      .getCharts(context.regions, context.brands)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (charts) => {
          this.charts.set(charts);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });

    this.dashboardService
      .getAttention(context.regions)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (items) => this.attentionItems.set(items) });

    this.approvalsService
      .getInbox()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (items) => this.approvalItems.set(items) });

    // Claims and schemes are signal stores — refresh() only primes them; the computed
    // counts above already track the store, so there is nothing to assign here.
    this.claimsService.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
    this.schemesService.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    if (this.permissionService.canAccess('BUDGET_VIEW')) {
      this.budgetService
        .getBudgets()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (records) => this.budgets.set(records) });
    }
  }
}
