import { Component, DestroyRef, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged, map } from 'rxjs';

import {
  DistributorAccountResponse,
  DistributorAccountWriteResponse,
} from '../../../../core/api/admin2.models';
import { int } from '../../../../core/api/api.types';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { Admin2DistributorsApi } from '../../services/admin2-distributors.api';
import { DistributorAccountsStore } from '../../services/distributor-accounts.store';
import {
  DISTRIBUTOR_STATUS_LABELS,
  DISTRIBUTOR_STATUS_PILL,
  DISTRIBUTORS_ROUTE,
  DistributorRowStatus,
  distributorStatusOf,
} from '../distributor.util';

type StatusTab = 'Active' | 'Locked' | 'Inactive' | 'All';
type SortKey = 'distributorId' | 'name' | 'businessType' | 'location' | 'city';

/** A row with what the filters need worked out once, not on every keystroke. */
interface IndexedRow {
  account: DistributorAccountResponse;
  status: DistributorRowStatus;
  /** Every searchable value, lower-cased and joined. */
  haystack: string;
  /** A stored region or territory code that no longer resolves to a name. */
  unresolvedLocation: boolean;
}

const PAGE_SIZE = 50;

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function compareRows(a: IndexedRow, b: IndexedRow, key: SortKey): number {
  const x = a.account;
  const y = b.account;
  switch (key) {
    case 'name':
      return COLLATOR.compare(x.name, y.name) || COLLATOR.compare(x.distributorId, y.distributorId);
    case 'businessType':
      return COLLATOR.compare(x.businessType, y.businessType) || COLLATOR.compare(x.name, y.name);
    case 'location':
      return (
        COLLATOR.compare(x.region, y.region) ||
        COLLATOR.compare(x.area, y.area) ||
        COLLATOR.compare(x.territory, y.territory) ||
        COLLATOR.compare(x.name, y.name)
      );
    case 'city':
      return COLLATOR.compare(x.city, y.city) || COLLATOR.compare(x.name, y.name);
    default:
      return COLLATOR.compare(x.distributorId, y.distributorId);
  }
}

/**
 * Distributors — the grid half of legacy's Create Distributor (Administration 2.0).
 *
 * Analysis mode (CLAUDE.md §7): dense table, filters in reach, and only the actions that
 * are safe from a row — edit, lock, unlock, deactivate. The form is its own route, as it
 * is for users and menus, rather than sitting above a 500-row grid the way legacy did.
 *
 * **Everything after the first load is in memory.** The API returns the whole directory
 * (about 520 accounts) with no cursor, so status, business type, search, sort and paging
 * never touch the network; see DistributorAccountsStore. The status tabs therefore count
 * exactly what they will show.
 */
@Component({
  selector: 'to-distributor-list',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './distributor-list.component.html',
  styleUrl: './distributor-list.component.scss',
})
export class DistributorListComponent {
  /** `?saved=<id>` — set by the form after a save, so the row can be found and marked. */
  readonly saved = input<string | undefined>(undefined);

  private readonly api = inject(Admin2DistributorsApi);
  private readonly store = inject(DistributorAccountsStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly statusLabels = DISTRIBUTOR_STATUS_LABELS;
  protected readonly statusPill = DISTRIBUTOR_STATUS_PILL;
  protected readonly route = DISTRIBUTORS_ROUTE;
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, index) => index);

  protected readonly loaded = this.store.loaded;
  protected readonly refreshing = this.store.refreshing;
  protected readonly loading = computed(() => !this.store.loaded() && !this.store.failed());
  protected readonly failed = computed(() => !this.store.loaded() && this.store.failed());

  protected readonly busyId = signal<string | null>(null);
  protected readonly pendingDeactivation = signal<DistributorAccountResponse | null>(null);
  protected readonly highlightId = signal<string | null>(null);

  // ─── Filters ────────────────────────────────────────────────────────────────

  /** Active first: it is what legacy's grid showed, and what an admin opens this for. */
  protected readonly status = signal<StatusTab>('Active');
  protected readonly sortKey = signal<SortKey>('distributorId');
  protected readonly desc = signal(false);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly businessTypeControl = new FormControl<number | null>(null);

  // In-memory search, so the debounce only spares re-rendering on every keystroke.
  private readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(120),
      map((value) => value.trim().toLowerCase()),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ),
    { initialValue: '' },
  );

  private readonly businessTypeId = toSignal(
    this.businessTypeControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)),
    { initialValue: null },
  );

  private readonly indexed = computed<IndexedRow[]>(() =>
    this.store.rows().map((account) => ({
      account,
      status: distributorStatusOf(account),
      haystack: [
        account.distributorId,
        account.name,
        account.contact,
        account.city,
        account.region,
        account.area,
        account.territory,
        account.businessType,
      ]
        .join('')
        .toLowerCase(),
      unresolvedLocation:
        (!!account.regionCode && !account.region) || (!!account.territoryCode && !account.territory),
    })),
  );

  protected readonly counts = computed(() => {
    let active = 0;
    let locked = 0;
    for (const row of this.indexed()) {
      if (row.account.isActive) {
        active++;
        if (row.account.isLocked) {
          locked++;
        }
      }
    }
    const all = this.indexed().length;
    return { Active: active, Locked: locked, Inactive: all - active, All: all } satisfies Record<StatusTab, number>;
  });

  protected readonly tabs: { key: StatusTab; label: string; hint: string }[] = [
    { key: 'Active', label: 'Active', hint: 'Can sign in' },
    { key: 'Locked', label: 'Locked', hint: 'Active, but refused at SSO sign-in' },
    { key: 'Inactive', label: 'Inactive', hint: 'Deactivated — cannot sign in' },
    { key: 'All', label: 'All', hint: 'Every account' },
  ];

  /** Only the business types someone actually holds — an option that filters to nothing is noise. */
  protected readonly businessTypeOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const { account } of this.indexed()) {
      const id = int(account.businessTypeId);
      if (id > 0 && !seen.has(id)) {
        seen.set(id, account.businessType || `Type ${id}`);
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a - b)
      .map(([value, label]) => ({ value, label }));
  });

  protected readonly filtered = computed(() => {
    const status = this.status();
    const term = this.search();
    const businessTypeId = this.businessTypeId();
    const key = this.sortKey();
    const direction = this.desc() ? -1 : 1;

    return this.indexed()
      .filter((row) => {
        const account = row.account;
        if (status === 'Active' && !account.isActive) return false;
        if (status === 'Inactive' && account.isActive) return false;
        if (status === 'Locked' && !(account.isActive && account.isLocked)) return false;
        if (businessTypeId !== null && int(account.businessTypeId) !== businessTypeId) return false;
        return !term || row.haystack.includes(term);
      })
      .sort((a, b) => direction * compareRows(a, b, key));
  });

  // ─── Paging (in memory) ─────────────────────────────────────────────────────

  /** Back to the first page whenever what is being paged changes. */
  protected readonly page = linkedSignal({
    source: () => [this.status(), this.search(), this.businessTypeId(), this.sortKey(), this.desc()],
    computation: () => 0,
  });

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / PAGE_SIZE)));

  protected readonly pageRows = computed(() => {
    const page = Math.min(this.page(), this.pageCount() - 1);
    return this.filtered().slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  });

  protected readonly rangeLabel = computed(() => {
    const total = this.filtered().length;
    if (total === 0) {
      return 'No distributors';
    }
    const page = Math.min(this.page(), this.pageCount() - 1);
    const from = page * PAGE_SIZE + 1;
    const to = Math.min(total, (page + 1) * PAGE_SIZE);
    return `${from.toLocaleString('en-PK')}–${to.toLocaleString('en-PK')} of ${total.toLocaleString('en-PK')}`;
  });

  protected readonly hasFilters = computed(
    () => this.search() !== '' || this.businessTypeId() !== null || this.status() !== 'All',
  );

  constructor() {
    // Shows what the store already holds at once and revalidates behind it.
    this.store.refresh();

    // After a save, bring the saved row into view once: widen the tab if it is filtered
    // out, then jump to its page. Runs once per visit.
    let settled = false;
    effect(() => {
      const id = this.saved();
      if (settled || !id || !this.store.loaded()) {
        return;
      }
      settled = true;
      const account = this.store.byId(id);
      if (!account) {
        return;
      }
      if (!this.filtered().some((row) => row.account.distributorId === id)) {
        this.status.set('All');
      }
      const index = this.filtered().findIndex((row) => row.account.distributorId === id);
      if (index >= 0) {
        this.page.set(Math.floor(index / PAGE_SIZE));
        this.highlightId.set(id);
      }
    });
  }

  protected setStatus(status: StatusTab): void {
    this.status.set(status);
  }

  protected toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.desc.update((value) => !value);
    } else {
      this.sortKey.set(key);
      this.desc.set(false);
    }
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.desc() ? 'descending' : 'ascending';
  }

  protected previousPage(): void {
    this.page.update((page) => Math.max(0, page - 1));
  }

  protected nextPage(): void {
    this.page.update((page) => Math.min(this.pageCount() - 1, page + 1));
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.businessTypeControl.setValue(null);
    this.status.set('All');
  }

  protected retry(): void {
    this.store.refresh();
  }

  // ─── Row actions ────────────────────────────────────────────────────────────

  protected lock(account: DistributorAccountResponse): void {
    this.run(
      account,
      this.api.lock(account.distributorId),
      `${account.name} locked. SSO sign-in will refuse them; password sign-in does not check the lock — deactivate to stop every sign-in.`,
      `${account.name} was already locked. Nothing changed.`,
    );
  }

  protected unlock(account: DistributorAccountResponse): void {
    this.run(
      account,
      this.api.unlock(account.distributorId),
      `${account.name} unlocked.`,
      `${account.name} was not locked. Nothing changed.`,
    );
  }

  protected requestDeactivate(account: DistributorAccountResponse): void {
    this.pendingDeactivation.set(account);
  }

  protected confirmDeactivate(): void {
    const account = this.pendingDeactivation();
    this.pendingDeactivation.set(null);
    if (!account) {
      return;
    }
    this.run(
      account,
      this.api.deactivate(account.distributorId),
      `${account.name} deactivated. They can no longer sign in.`,
      `${account.name} was already inactive. Nothing changed.`,
    );
  }

  protected readonly deactivateMessage = computed(() => {
    const account = this.pendingDeactivation();
    if (!account) {
      return '';
    }
    return (
      `${account.name} (${account.distributorId}) will no longer be able to sign in. The account and ` +
      'its claims are kept, but there is no screen to reactivate it — that needs a database change.'
    );
  });

  /**
   * Applies a status write and patches that row from the response rather than refetching
   * the directory. A row that no longer matches the tab drops out of it on its own, which
   * is what the tab asked for — the toast says what happened.
   */
  private run(
    account: DistributorAccountResponse,
    action$: Observable<DistributorAccountWriteResponse>,
    changedMessage: string,
    unchangedMessage: string,
  ): void {
    this.busyId.set(account.distributorId);
    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.store.upsert(response.distributor);
        this.busyId.set(null);
        // An empty changedFields means the server wrote nothing. Saying "locked" there
        // would claim a change that never happened.
        if (response.changedFields.length > 0) {
          this.notifications.success(changedMessage);
        } else {
          this.notifications.info(unchangedMessage);
        }
      },
      // The error interceptor raises the toast; clearing the busy flag is all that is left.
      error: () => this.busyId.set(null),
    });
  }
}
