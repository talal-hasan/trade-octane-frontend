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
  BudgetCodeResponse,
  BudgetOwnerResponse,
  BudgetShellResponse,
  BudgetTableResponse,
} from '../../../../core/api/operations.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import {
  MultiSelectPickerComponent,
  PickerOption,
} from '../../../../shared/components/multi-select-picker/multi-select-picker.component';
import { AdminOperationsApi } from '../../services/admin-operations.api';

/**
 * Change Budget Ownership.
 *
 * The same four-step shape as activity ownership — **period → dimension table → current
 * owner → shells → new owner** — with one extra narrowing step, because budgets are split
 * across several dimension tables and a shell only exists inside one of them.
 *
 * Legacy ran three queries across one postback here and left the products to a fourth;
 * `/budget-ownership/scope` returns the tables, the current owners and the eligible
 * recipients in a single call. It also surfaces owners legacy could not list at all — it
 * used an inner join to USERS with no active test, so budgets sitting with a departed
 * employee were invisible. `stuckShellCount` counts exactly those.
 */
@Component({
  selector: 'to-budget-ownership',
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
    MultiSelectPickerComponent,
  ],
  // Shares the ownership chrome in the global `_admin.scss` partial.
  templateUrl: './budget-ownership.component.html',
})
export class BudgetOwnershipComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  // ─── Step 1 — period & scope filters ────────────────────────────────────────

  protected readonly filtersLoading = signal(true);
  protected readonly years = signal<readonly number[]>([]);
  protected readonly months = signal<readonly BudgetCodeResponse[]>([]);
  protected readonly schemeTypes = signal<readonly BudgetCodeResponse[]>([]);
  protected readonly regions = signal<readonly BudgetCodeResponse[]>([]);

  protected readonly year = signal<number | null>(null);
  protected readonly month = signal<number | null>(null);
  protected readonly selectedSchemes = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly selectedRegions = signal<ReadonlySet<string>>(new Set<string>());

  constructor() {
    this.api
      .budgetFilters()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (filters) => {
          const years = (filters.years ?? []).map((y) => int(y)).filter((y) => y > 0);
          this.years.set(years);
          this.months.set(filters.months ?? []);
          this.schemeTypes.set(filters.schemeTypes ?? []);
          this.regions.set(filters.regions ?? []);
          if (years.length > 0) {
            this.year.set(Math.max(...years));
          }
          this.filtersLoading.set(false);
          this.loadScope();
        },
        error: () => this.filtersLoading.set(false),
      });
  }

  protected setYear(value: number): void {
    this.year.set(value);
    this.resetDownstream();
    this.loadScope();
  }

  protected setMonth(value: number): void {
    this.month.set(this.month() === value ? null : value);
    this.resetDownstream();
    this.loadScope();
  }

  /** Catalogue entries as picker options, with the code kept visible as the hint. */
  protected readonly schemeOptions = computed<PickerOption[]>(() =>
    this.schemeTypes().map((s) => ({
      value: s.code,
      label: s.description || s.code,
      hint: s.description ? s.code : undefined,
    })),
  );

  protected readonly regionOptions = computed<PickerOption[]>(() =>
    this.regions().map((r) => ({
      value: r.code,
      label: r.description || r.code,
      hint: r.description ? r.code : undefined,
    })),
  );

  protected setSchemes(next: ReadonlySet<string>): void {
    this.selectedSchemes.set(next);
    this.resetDownstream();
    this.loadScope();
  }

  protected setRegions(next: ReadonlySet<string>): void {
    this.selectedRegions.set(next);
    this.resetDownstream();
    this.loadScope();
  }

  protected clearScopeFilters(): void {
    this.selectedSchemes.set(new Set<string>());
    this.selectedRegions.set(new Set<string>());
    this.resetDownstream();
    this.loadScope();
  }

  private resetDownstream(): void {
    this.table.set(null);
    this.currentOwner.set(null);
    this.rows.set([]);
    this.selection.set(new Set<string>());
    this.newOwnerControl.setValue('');
    this.pager.reset();
  }

  private scopeQuery() {
    return {
      year: this.year() ?? undefined,
      month: this.month() ?? undefined,
      schemeId: [...this.selectedSchemes()],
      regionCode: [...this.selectedRegions()],
    };
  }

  // ─── Step 2 — scope: tables, owners, recipients ─────────────────────────────

  protected readonly scopeLoading = signal(false);
  protected readonly tables = signal<readonly BudgetTableResponse[]>([]);
  protected readonly owners = signal<readonly BudgetOwnerResponse[]>([]);
  protected readonly eligibleOwners = signal<readonly BudgetOwnerResponse[]>([]);
  protected readonly totalShells = signal(0);
  protected readonly stuckShells = signal(0);

  protected readonly table = signal<BudgetTableResponse | null>(null);

  private loadScope(): void {
    if (this.year() === null) {
      return;
    }
    this.scopeLoading.set(true);
    this.api
      .budgetScope(this.scopeQuery())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (scope) => {
          const tables = scope.tables ?? [];
          this.tables.set(tables);
          this.owners.set(scope.currentOwners ?? []);
          this.eligibleOwners.set(scope.eligibleOwners ?? []);
          this.totalShells.set(int(scope.totalShellCount));
          this.stuckShells.set(int(scope.stuckShellCount));
          // One table is the common case; skipping a pointless choice is worth a line.
          if (tables.length === 1) {
            this.table.set(tables[0]);
          }
          this.scopeLoading.set(false);
        },
        error: () => {
          this.tables.set([]);
          this.owners.set([]);
          this.scopeLoading.set(false);
        },
      });
  }

  protected selectTable(value: BudgetTableResponse): void {
    this.table.set(this.table()?.tableName === value.tableName ? null : value);
    this.currentOwner.set(null);
    this.rows.set([]);
    this.selection.set(new Set<string>());
    this.pager.reset();
  }

  // ─── Step 3 — current owner ─────────────────────────────────────────────────

  protected readonly ownerSearch = signal('');
  protected readonly currentOwner = signal<BudgetOwnerResponse | null>(null);

  protected readonly visibleOwners = computed(() => {
    const term = this.ownerSearch().trim().toLowerCase();
    const list = [...this.owners()].sort((a, b) => int(b.shellCount) - int(a.shellCount));
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

  protected selectOwner(owner: BudgetOwnerResponse): void {
    this.currentOwner.set(owner);
    this.selection.set(new Set<string>());
    this.newOwnerControl.setValue('');
    this.pager.reset();
    this.loadShells();
  }

  // ─── Step 4 — shells ────────────────────────────────────────────────────────

  protected readonly rowsLoading = signal(false);
  protected readonly rows = signal<readonly BudgetShellResponse[]>([]);
  protected readonly driftedCount = signal(0);
  protected readonly resultsTruncated = signal(false);
  protected readonly exporting = signal(false);
  protected readonly rowSearchControl = new FormControl('', { nonNullable: true });
  protected readonly driftedOnly = signal(false);
  protected readonly selection = signal<ReadonlySet<string>>(new Set<string>());

  private readonly pager = new CursorPager(50);
  protected readonly pagerState = this.pager.state;

  private shellQuery(includeCursor: boolean) {
    return {
      ...this.scopeQuery(),
      tableName: this.table()?.tableName,
      currentOwner: this.currentOwner()?.userId,
      search: this.rowSearchControl.value.trim() || undefined,
      driftedOnly: this.driftedOnly() || undefined,
      sort: 'BudgetValue' as const,
      desc: true,
      ...(includeCursor ? { pageSize: this.pager.pageSize(), cursor: this.pager.cursor() } : {}),
    };
  }

  private loadShells(): void {
    if (!this.currentOwner() || !this.table()) {
      return;
    }
    this.rowsLoading.set(true);
    this.api
      .budgetShells(this.shellQuery(true))
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
    this.loadShells();
  }

  protected toggleDriftedOnly(): void {
    this.driftedOnly.update((v) => !v);
    this.searchRows();
  }

  protected nextPage(): void {
    if (this.pager.next()) {
      this.loadShells();
    }
  }

  protected previousPage(): void {
    if (this.pager.previous()) {
      this.loadShells();
    }
  }

  protected toggleRow(row: BudgetShellResponse): void {
    this.selection.update((current) => toggle(current, row.shellCode));
  }

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.rows();
    const selected = this.selection();
    return rows.length > 0 && rows.every((row) => selected.has(row.shellCode));
  });

  /** Page-scoped, for the same reason as activity ownership — see that component. */
  protected toggleAllVisible(): void {
    const codes = this.rows().map((row) => row.shellCode);
    const selectAll = !this.allVisibleSelected();
    this.selection.update((current) => {
      const next = new Set(current);
      for (const code of codes) {
        if (selectAll) {
          next.add(code);
        } else {
          next.delete(code);
        }
      }
      return next;
    });
  }

  /** PKR total of the current selection — the figure that makes a transfer feel real. */
  protected readonly selectedValue = computed(() => {
    const selected = this.selection();
    return this.rows()
      .filter((row) => selected.has(row.shellCode))
      .reduce((sum, row) => sum + (Number(row.budgetValue) || 0), 0);
  });

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api
      .exportBudgetShells(this.shellQuery(false))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('trade-octane-budget-shells'));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  // ─── Step 5 — transfer ──────────────────────────────────────────────────────

  protected readonly newOwnerControl = new FormControl('', { nonNullable: true });
  protected readonly transferring = signal(false);
  protected readonly confirming = signal(false);

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
    const value = this.selectedValue();
    return `${count} budget ${count === 1 ? 'shell' : 'shells'} worth PKR ${value.toLocaleString('en-PK')} will move from ${from?.fullName ?? from?.userId ?? 'the current owner'} to ${to}. Their approval rows move with them, and the whole transfer rolls back if the set changes first.`;
  });

  protected confirmTransfer(): void {
    this.confirming.set(false);
    const owner = this.currentOwner();
    const newOwner = this.newOwnerControl.value.trim();
    if (!owner || !newOwner) {
      return;
    }
    const shellCodes = [...this.selection()];

    this.transferring.set(true);
    this.api
      .transferBudgetOwnership({
        shellCodes,
        currentOwner: owner.userId,
        newOwner,
        expectedCount: shellCodes.length,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.transferring.set(false);
          this.notifications.success(
            `${int(response.shellsTransferred)} shell(s) moved to ${response.newOwnerFullName ?? response.newOwner}. ${int(response.approvalRowsUpdated)} approval row(s) updated.`,
          );
          this.selection.set(new Set<string>());
          this.loadScope();
          this.loadShells();
        },
        error: () => this.transferring.set(false),
      });
  }

  protected ownerLabel(owner: BudgetOwnerResponse): string {
    return owner.fullName || owner.userId;
  }

  protected formatPkr(value: number | string | null): string {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? `PKR ${Math.round(parsed).toLocaleString('en-PK')}` : '—';
  }
}

function toggle(current: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(current);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
}
