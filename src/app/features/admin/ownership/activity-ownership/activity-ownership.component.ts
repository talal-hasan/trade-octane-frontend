import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import { csvFilename, saveBlob } from '../../../../core/api/api-client.service';
import { int } from '../../../../core/api/api.types';
import { CursorPager } from '../../../../core/api/cursor-pager';
import {
  ActivityCodeResponse,
  ActivityOwnerResponse,
  ActivityResponse,
} from '../../../../core/api/operations.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminOperationsApi } from '../../services/admin-operations.api';

/**
 * Change Activity Ownership.
 *
 * Four steps, in order, because each narrows the next: **period → current owner →
 * activities → new owner**. Nothing is fetched speculatively; picking a period is what
 * reveals who owns anything in it.
 *
 * `stuckActivityCount` is the figure the screen is really about: activities owned by
 * someone who has left or been deactivated, which no longer move on their own.
 *
 * The transfer is guarded by `expectedCount`, taken from the selection the user is looking
 * at. The server compares it against its own UPDATE and rolls back on a mismatch, so a
 * transfer is never partially applied.
 */
@Component({
  selector: 'to-activity-ownership',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
  ],
  // No stylesheet of its own: the ownership flow's chrome is shared with budget
  // ownership and lives in the global `_admin.scss` partial.
  templateUrl: './activity-ownership.component.html',
})
export class ActivityOwnershipComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  // ─── Step 1 — period ────────────────────────────────────────────────────────

  protected readonly filtersLoading = signal(true);
  protected readonly years = signal<readonly number[]>([]);
  protected readonly months = signal<readonly ActivityCodeResponse[]>([]);
  protected readonly claimTypes = signal<readonly ActivityCodeResponse[]>([]);

  protected readonly year = signal<number | null>(null);
  protected readonly month = signal<number | null>(null);
  protected readonly claimType = signal<string | null>(null);

  constructor() {
    this.api
      .activityFilters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (filters) => {
          const years = (filters.years ?? []).map((y) => int(y)).filter((y) => y > 0);
          this.years.set(years);
          this.months.set(filters.months ?? []);
          this.claimTypes.set(filters.claimTypes ?? []);
          // Default to the most recent year so the screen is usable in one click.
          if (years.length > 0) {
            this.year.set(Math.max(...years));
          }
          this.filtersLoading.set(false);
          this.loadOwners();
        },
        error: () => this.filtersLoading.set(false),
      });
  }

  protected setYear(value: number): void {
    this.year.set(value);
    this.resetDownstream();
    this.loadOwners();
  }

  protected setMonth(value: number | null): void {
    this.month.set(this.month() === value ? null : value);
    this.resetDownstream();
    this.loadOwners();
  }

  protected setClaimType(value: string | null): void {
    this.claimType.set(this.claimType() === value ? null : value);
    this.resetDownstream();
    this.loadOwners();
  }

  /** A period change invalidates the owner, the rows and the selection beneath it. */
  private resetDownstream(): void {
    this.currentOwner.set(null);
    this.rows.set([]);
    this.selection.set(new Set<string>());
    this.candidates.set([]);
    this.newOwnerControl.setValue('');
    this.pager.reset();
  }

  // ─── Step 2 — current owner ─────────────────────────────────────────────────

  protected readonly ownersLoading = signal(false);
  protected readonly owners = signal<readonly ActivityOwnerResponse[]>([]);
  protected readonly totalActivities = signal(0);
  protected readonly stuckActivities = signal(0);
  protected readonly ownerSearch = signal('');
  protected readonly currentOwner = signal<ActivityOwnerResponse | null>(null);

  private loadOwners(): void {
    const year = this.year();
    if (year === null) {
      return;
    }
    this.ownersLoading.set(true);
    this.api
      .activityOwners({
        year,
        month: this.month() ?? undefined,
        claimType: this.claimType() ?? undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (scope) => {
          this.owners.set(scope.currentOwners ?? []);
          this.totalActivities.set(int(scope.totalActivityCount));
          this.stuckActivities.set(int(scope.stuckActivityCount));
          this.ownersLoading.set(false);
        },
        error: () => {
          this.owners.set([]);
          this.ownersLoading.set(false);
        },
      });
  }

  protected readonly visibleOwners = computed(() => {
    const term = this.ownerSearch().trim().toLowerCase();
    const list = [...this.owners()].sort(
      (a, b) => int(b.activityCount) - int(a.activityCount),
    );
    if (!term) {
      return list;
    }
    return list.filter(
      (owner) =>
        owner.userId.toLowerCase().includes(term) ||
        (owner.fullName ?? '').toLowerCase().includes(term),
    );
  });

  protected onOwnerSearch(value: string): void {
    this.ownerSearch.set(value);
  }

  protected selectOwner(owner: ActivityOwnerResponse): void {
    this.currentOwner.set(owner);
    this.selection.set(new Set<string>());
    this.newOwnerControl.setValue('');
    this.pager.reset();
    this.loadActivities();
    this.loadCandidates(owner.userId);
  }

  // ─── Step 3 — activities ────────────────────────────────────────────────────

  protected readonly rowsLoading = signal(false);
  protected readonly rows = signal<readonly ActivityResponse[]>([]);
  protected readonly driftedCount = signal(0);
  protected readonly resultsTruncated = signal(false);
  protected readonly exporting = signal(false);
  protected readonly rowSearchControl = new FormControl('', { nonNullable: true });
  protected readonly driftedOnly = signal(false);

  private readonly pager = new CursorPager(50);
  protected readonly pagerState = this.pager.state;

  /** Keyed `mpCode|seqId` — an activity is identified by the pair, never by one alone. */
  protected readonly selection = signal<ReadonlySet<string>>(new Set<string>());

  protected keyOf(row: { mpCode: string; seqId: string }): string {
    return `${row.mpCode}|${row.seqId}`;
  }

  private activityQuery(includeCursor: boolean) {
    return {
      year: this.year() ?? undefined,
      month: this.month() ?? undefined,
      claimType: this.claimType() ?? undefined,
      currentOwner: this.currentOwner()?.userId,
      search: this.rowSearchControl.value.trim() || undefined,
      driftedOnly: this.driftedOnly() || undefined,
      sort: 'PeriodFrom' as const,
      desc: true,
      ...(includeCursor ? { pageSize: this.pager.pageSize(), cursor: this.pager.cursor() } : {}),
    };
  }

  private loadActivities(): void {
    if (!this.currentOwner()) {
      return;
    }
    this.rowsLoading.set(true);
    this.api
      .activities(this.activityQuery(true))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const items = page.items ?? [];
          this.rows.set(items);
          this.driftedCount.set(int(page.driftedCount));
          this.resultsTruncated.set(page.resultsTruncated === true);
          this.pager.absorb({
            nextCursor: page.nextCursor ?? null,
            totalCount: page.totalCount,
            pageSize: this.pager.pageSize(),
            rowCount: items.length,
          });
          this.rowsLoading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.rowsLoading.set(false);
        },
      });
  }

  protected searchRows(): void {
    this.pager.reset();
    this.selection.set(new Set<string>());
    this.loadActivities();
  }

  protected toggleDriftedOnly(): void {
    this.driftedOnly.update((v) => !v);
    this.searchRows();
  }

  protected nextPage(): void {
    if (this.pager.next()) {
      this.loadActivities();
    }
  }

  protected previousPage(): void {
    if (this.pager.previous()) {
      this.loadActivities();
    }
  }

  protected toggleRow(row: ActivityResponse): void {
    const key = this.keyOf(row);
    this.selection.update((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.rows();
    const selected = this.selection();
    return rows.length > 0 && rows.every((row) => selected.has(this.keyOf(row)));
  });

  /**
   * Select-all covers the **loaded page**, not the whole result set.
   *
   * A transfer is guarded on `expectedCount`, and that count must match rows the user
   * actually saw. Selecting rows beyond the page would send a count for records nobody
   * reviewed — and would 409 the moment the unseen tail changed.
   */
  protected toggleAllVisible(): void {
    const keys = this.rows().map((row) => this.keyOf(row));
    const selectAll = !this.allVisibleSelected();
    this.selection.update((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (selectAll) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api
      .exportActivities(this.activityQuery(false))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('trade-octane-activities'));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  // ─── Step 4 — new owner + transfer ──────────────────────────────────────────

  protected readonly candidates = signal<readonly ActivityOwnerResponse[]>([]);
  protected readonly candidatesWidened = signal(false);
  protected readonly newOwnerControl = new FormControl('', { nonNullable: true });
  protected readonly transferring = signal(false);
  protected readonly confirming = signal(false);

  private loadCandidates(currentOwner: string): void {
    this.api
      .activityCandidates(currentOwner)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.candidates.set(response.candidates ?? []);
          // The server fell back to every active user because the peer set was empty.
          // Saying so matters: it is a different question than the one that was asked.
          this.candidatesWidened.set(response.widened === true);
        },
        error: () => this.candidates.set([]),
      });
  }

  protected readonly canTransfer = computed(
    () =>
      this.currentOwner() !== null &&
      this.selection().size > 0 &&
      this.newOwnerControl.value.trim().length > 0 &&
      !this.transferring(),
  );

  protected readonly confirmMessage = computed(() => {
    const count = this.selection().size;
    const from = this.currentOwner();
    const to = this.newOwnerControl.value;
    return `${count} ${count === 1 ? 'activity' : 'activities'} will move from ${from?.fullName ?? from?.userId ?? 'the current owner'} to ${to}. Their approval rows move with them. If the set changes before this runs, the whole transfer rolls back rather than half-applying.`;
  });

  protected confirmTransfer(): void {
    this.confirming.set(false);
    const owner = this.currentOwner();
    const newOwner = this.newOwnerControl.value.trim();
    if (!owner || !newOwner) {
      return;
    }
    const selected = this.selection();
    const activities = this.rows()
      .filter((row) => selected.has(this.keyOf(row)))
      .map((row) => ({ mpCode: row.mpCode, seqId: row.seqId }));

    this.transferring.set(true);
    this.api
      .transferActivityOwnership({
        activities,
        currentOwner: owner.userId,
        newOwner,
        expectedCount: activities.length,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.transferring.set(false);
          this.notifications.success(
            `${int(response.activitiesTransferred)} activity(ies) moved to ${response.newOwnerFullName ?? response.newOwner}. ${int(response.approvalRowsUpdated)} approval row(s) updated.`,
          );
          this.selection.set(new Set<string>());
          this.loadOwners();
          this.loadActivities();
        },
        error: () => this.transferring.set(false),
      });
  }

  protected formatDate(value: string | null): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }).format(
          date,
        );
  }

  protected ownerLabel(owner: ActivityOwnerResponse): string {
    return owner.fullName || owner.userId;
  }
}
