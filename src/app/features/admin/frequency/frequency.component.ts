import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { int } from '../../../core/api/api.types';
import {
  FrequencyConfigurationResponse,
  FrequencyGroupResponse,
} from '../../../core/api/operations.models';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { AdminOperationsApi } from '../services/admin-operations.api';

/** A row being edited in place. Null fields mean "unchanged". */
interface RowEdit {
  frequencyGt: number;
  frequencyFsd: number;
}

/**
 * Frequency Configuration — how often each scheme accrues, and how far back budgets and
 * claims may be posted.
 *
 * Edited **in place** rather than through a modal per row: an admin setting cadences works
 * down a list comparing neighbouring values, and a dialog that hides the other rows removes
 * exactly the context the decision needs.
 *
 * The prior-month windows are deliberately a **bulk** action instead of a per-row field.
 * The API takes `schemeIds[]` for them, and in practice they are set to one policy across
 * many schemes at once; making it per-row would turn one decision into fifty edits.
 *
 * Scheme groups filter the grid as legacy's "Select Scheme Group All | None" list did:
 * several at once, every group ticked on arrival. The list endpoint returns every scheme (72),
 * so the filter runs in memory — the API has no group parameter on it.
 *
 * This screen has no legacy menu row (see ADMIN_ONLY_ROUTES) — it is gated on holding an
 * Administration grant.
 */
@Component({
  selector: 'to-frequency',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './frequency.component.html',
  styleUrl: './frequency.component.scss',
})
export class FrequencyComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly savingScheme = signal<string | null>(null);

  protected readonly rows = signal<readonly FrequencyConfigurationResponse[]>([]);
  protected readonly groups = signal<readonly FrequencyGroupResponse[]>([]);
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  // ─── Scheme group filter ────────────────────────────────────────────────────

  /**
   * The groups *un*ticked. Stored this way round so every group starts ticked, as legacy's
   * did, and a group that appears later is ticked too rather than silently filtered out.
   */
  private readonly excludedGroups = signal<ReadonlySet<string>>(new Set<string>());

  /**
   * Group names, once each. Names rather than keys: key B15 is filed under both DBDP and
   * VTR-1, so filtering by key listed "VTR-1" twice and pulled DBDP schemes in under it.
   * A name the groups endpoint did not return still gets a chip if a scheme carries it.
   */
  protected readonly groupNames = computed(() => {
    const names = new Set(this.groups().map((group) => group.schemeGroup || group.groupKey));
    for (const row of this.rows()) {
      names.add(groupOf(row));
    }
    names.delete('');
    return [...names];
  });

  /** Schemes per group, among the rows the search returned. */
  protected readonly groupCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const row of this.rows()) {
      counts.set(groupOf(row), (counts.get(groupOf(row)) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly selectedGroupCount = computed(
    () => this.groupNames().filter((name) => !this.excludedGroups().has(name)).length,
  );

  /** The rows on screen: the search's rows, in a ticked group. */
  protected readonly visibleRows = computed(() => {
    const excluded = this.excludedGroups();
    return this.rows().filter((row) => !excluded.has(groupOf(row)));
  });

  protected isGroupSelected(name: string): boolean {
    return !this.excludedGroups().has(name);
  }

  protected toggleGroup(name: string): void {
    this.excludedGroups.update((current) => {
      const next = new Set(current);
      if (!next.delete(name)) {
        next.add(name);
      }
      return next;
    });
    this.keepSelectionVisible();
  }

  protected selectAllGroups(): void {
    this.excludedGroups.set(new Set<string>());
  }

  protected selectNoGroups(): void {
    this.excludedGroups.set(new Set(this.groupNames()));
    this.keepSelectionVisible();
  }

  /**
   * Unticks schemes a group change has hidden. The prior-month windows apply to the ticked
   * schemes, and a scheme the admin can no longer see must not be changed by them.
   */
  private keepSelectionVisible(): void {
    const visible = new Set(this.visibleRows().map((row) => row.schemeId));
    this.selection.update((current) => new Set([...current].filter((id) => visible.has(id))));
  }

  /** Pending in-place edits, keyed by schemeId. Absent = untouched. */
  private readonly edits = signal<ReadonlyMap<string, RowEdit>>(new Map());

  constructor() {
    this.api
      .frequencyGroups()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (groups) => this.groups.set(groups),
        error: () => this.groups.set([]),
      });
    this.load();
  }

  private query() {
    return {
      search: this.searchControl.value.trim() || undefined,
    };
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .frequencyConfigurations(this.query())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.edits.set(new Map());
          this.selection.set(new Set<string>());
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected applyFilters(): void {
    this.load();
  }

  protected retry(): void {
    this.load();
  }

  // ─── In-place editing ───────────────────────────────────────────────────────

  protected valueFor(row: FrequencyConfigurationResponse, field: keyof RowEdit): number {
    const edit = this.edits().get(row.schemeId);
    if (edit) {
      return edit[field];
    }
    return int(field === 'frequencyGt' ? row.frequencyGt : row.frequencyFsd);
  }

  protected isDirty(row: FrequencyConfigurationResponse): boolean {
    const edit = this.edits().get(row.schemeId);
    if (!edit) {
      return false;
    }
    return (
      edit.frequencyGt !== int(row.frequencyGt) || edit.frequencyFsd !== int(row.frequencyFsd)
    );
  }

  protected onEdit(row: FrequencyConfigurationResponse, field: keyof RowEdit, raw: string): void {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return;
    }
    this.edits.update((current) => {
      const next = new Map(current);
      const existing = next.get(row.schemeId) ?? {
        frequencyGt: int(row.frequencyGt),
        frequencyFsd: int(row.frequencyFsd),
      };
      next.set(row.schemeId, { ...existing, [field]: parsed });
      return next;
    });
  }

  protected saveRow(row: FrequencyConfigurationResponse): void {
    const edit = this.edits().get(row.schemeId);
    if (!edit || this.savingScheme()) {
      return;
    }
    this.savingScheme.set(row.schemeId);
    this.api
      .updateFrequency(row.schemeId, edit.frequencyGt, edit.frequencyFsd)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.applyWrite(response.items ?? []);
          this.savingScheme.set(null);
          this.notifications.success(`${row.description || row.schemeId} updated.`);
        },
        error: () => this.savingScheme.set(null),
      });
  }

  protected toggleAccrual(row: FrequencyConfigurationResponse): void {
    if (this.savingScheme()) {
      return;
    }
    const next = int(row.forAccruals) === 1 ? 0 : 1;
    this.savingScheme.set(row.schemeId);
    this.api
      .updateAccrual(row.schemeId, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.applyWrite(response.items ?? []);
          this.savingScheme.set(null);
          this.notifications.success(
            next === 1 ? 'Scheme now feeds accruals.' : 'Scheme no longer feeds accruals.',
          );
        },
        error: () => this.savingScheme.set(null),
      });
  }

  /** Patches the returned rows in place; a refetch would lose the admin's scroll position. */
  private applyWrite(updated: readonly FrequencyConfigurationResponse[]): void {
    if (updated.length === 0) {
      return;
    }
    const byId = new Map(updated.map((row) => [row.schemeId, row]));
    this.rows.update((rows) => rows.map((row) => byId.get(row.schemeId) ?? row));
    this.edits.update((current) => {
      const next = new Map(current);
      for (const id of byId.keys()) {
        next.delete(id);
      }
      return next;
    });
  }

  // ─── Bulk prior-month windows ───────────────────────────────────────────────

  protected readonly selection = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly budgetMonthsControl = new FormControl(0, { nonNullable: true });
  protected readonly claimMonthsControl = new FormControl(0, { nonNullable: true });
  protected readonly bulkSaving = signal(false);
  protected readonly confirmingBulk = signal<'budget' | 'claim' | null>(null);

  protected toggleRowSelection(row: FrequencyConfigurationResponse): void {
    this.selection.update((current) => {
      const next = new Set(current);
      if (!next.delete(row.schemeId)) {
        next.add(row.schemeId);
      }
      return next;
    });
  }

  protected readonly allSelected = computed(() => {
    const rows = this.visibleRows();
    const selected = this.selection();
    return rows.length > 0 && rows.every((row) => selected.has(row.schemeId));
  });

  protected toggleAll(): void {
    const selectAll = !this.allSelected();
    this.selection.set(selectAll ? new Set(this.visibleRows().map((row) => row.schemeId)) : new Set());
  }

  protected readonly bulkMessage = computed(() => {
    const kind = this.confirmingBulk();
    if (!kind) {
      return '';
    }
    const months =
      kind === 'budget' ? this.budgetMonthsControl.value : this.claimMonthsControl.value;
    const count = this.selection().size;
    const what = kind === 'budget' ? 'budgets' : 'claims';
    return `${count} scheme(s) will allow ${what} to be posted up to ${months} month(s) back. This changes what users can submit immediately.`;
  });

  protected applyBulk(): void {
    const kind = this.confirmingBulk();
    this.confirmingBulk.set(null);
    if (!kind || this.selection().size === 0) {
      return;
    }
    const ids = [...this.selection()];
    const months =
      kind === 'budget' ? this.budgetMonthsControl.value : this.claimMonthsControl.value;

    this.bulkSaving.set(true);
    const request$ =
      kind === 'budget'
        ? this.api.updateBudgetPriorMonths(ids, months)
        : this.api.updateClaimPriorMonths(ids, months);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.applyWrite(response.items ?? []);
        this.bulkSaving.set(false);
        this.notifications.success(`${int(response.updatedCount)} scheme(s) updated.`);
      },
      error: () => this.bulkSaving.set(false),
    });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api
      .exportFrequencyConfigurations(this.query())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('trade-octane-frequency'));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  protected isActive(row: FrequencyConfigurationResponse): boolean {
    return int(row.activeFlag) === 1;
  }

  protected feedsAccruals(row: FrequencyConfigurationResponse): boolean {
    return int(row.forAccruals) === 1;
  }
}

/** The group a scheme is filed under, as its chip names it. */
function groupOf(row: FrequencyConfigurationResponse): string {
  return row.schemeGroup || row.groupKey || '';
}
