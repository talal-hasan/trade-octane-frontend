import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription, debounceTime, distinctUntilChanged, from, map, mergeMap, tap } from 'rxjs';

import {
  DistributorAccessDistributorResponse,
  DistributorAccountResponse,
} from '../../../core/api/admin2.models';
import { int, intSet } from '../../../core/api/api.types';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import {
  DISTRIBUTORS_ROUTE,
  DISTRIBUTOR_STATUS_LABELS,
  DISTRIBUTOR_STATUS_PILL,
  DistributorRowStatus,
} from '../distributors/distributor.util';
import { Admin2DistributorAccessApi } from '../services/admin2-distributor-access.api';
import { Admin2DistributorsApi } from '../services/admin2-distributors.api';
import { DistributorAccessCatalogueStore } from '../services/distributor-access-catalogue.store';
import { DistributorAccountsStore } from '../services/distributor-accounts.store';
import { MenuGrantTreeComponent } from './menu-grant-tree/menu-grant-tree.component';
import {
  DETAIL_LIMIT,
  allMenuIds,
  buildMenuIndex,
  cascadeToggle,
  intersectionOf,
  orphansIn,
  saveImpact,
  tally,
  toggleSubtree,
  unionOf,
  unknownIn,
} from './distributor-access.util';

type StatusTab = 'Active' | 'Inactive' | 'All';
type AccessTab = 'Any' | 'Granted' | 'None';
type SortKey = 'distributorId' | 'name' | 'businessType' | 'location' | 'city' | 'menus';

/** The server takes at most 1,000 distributors in one write. */
const MAX_DISTRIBUTORS = 1000;

/** Parallel requests when loading the selection's grants. */
const FETCH_CONCURRENCY = 6;

const PAGE_SIZE = 50;

/** How many per-distributor changes the panel lists before it just counts the rest. */
const IMPACT_PREVIEW = 12;

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const COUNT = new Intl.NumberFormat('en-PK');

/** Same members, ignoring order. */
function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  return a.size === b.size && [...a].every((value) => b.has(value));
}

/**
 * A grid row: the access catalogue's distributor, joined to its account record for the
 * columns the catalogue does not carry, with the filter values worked out once.
 */
interface GridRow {
  distributor: DistributorAccessDistributorResponse;
  distributorId: string;
  name: string;
  grantedMenuCount: number;
  status: DistributorRowStatus;
  /** Undefined when the account directory did not load, or has no row for this login. */
  account: DistributorAccountResponse | undefined;
  businessType: string;
  territory: string;
  region: string;
  area: string;
  /** `Region · Area`, under the territory. Empty when neither resolved. */
  locationSecondary: string;
  city: string;
  /** Every searchable value, lower-cased and joined. */
  haystack: string;
}

function compareRows(a: GridRow, b: GridRow, key: SortKey): number {
  switch (key) {
    case 'name':
      return COLLATOR.compare(a.name, b.name) || COLLATOR.compare(a.distributorId, b.distributorId);
    case 'businessType':
      return COLLATOR.compare(a.businessType, b.businessType) || COLLATOR.compare(a.name, b.name);
    case 'location':
      return (
        COLLATOR.compare(a.region, b.region) ||
        COLLATOR.compare(a.area, b.area) ||
        COLLATOR.compare(a.territory, b.territory) ||
        COLLATOR.compare(a.name, b.name)
      );
    case 'city':
      return COLLATOR.compare(a.city, b.city) || COLLATOR.compare(a.name, b.name);
    case 'menus':
      return a.grantedMenuCount - b.grantedMenuCount || COLLATOR.compare(a.name, b.name);
    default:
      return COLLATOR.compare(a.distributorId, b.distributorId);
  }
}

/**
 * Distributor Access — which screens of the distributor portal each distributor can open.
 * Legacy `CPS_Access_Control.aspx`, Administration 2.0 (MenuID 93).
 *
 * **One screen: the distributors on the left, the menu they will hold on the right.** The
 * grid is the picker *and* the directory — pick one row to read and edit what it holds, or
 * tick many to give them all the same menu, which is the write the endpoint performs
 * (`PUT .../menus` replaces every named distributor's set in one transaction).
 *
 * **What legacy could not do, and this does:**
 *
 * - *The tree was never ticked.* The code that loaded current grants was commented out, so
 *   every save started from an empty tree and revoked whatever was not re-ticked. Selecting
 *   one distributor here shows exactly what it holds.
 * - *A save said nothing about its effect.* Before saving, the panel lists the distributors
 *   that change and what each gains and loses — computed from their loaded grants, so it is
 *   the real diff rather than a restatement of the request.
 * - *A child could be granted without its parent* — 200 grants are stored that way and the
 *   portal has never shown one. Ticking cascades both directions, so the editor cannot make
 *   another; ones already stored are flagged `hidden` and offered a repair.
 *
 * **Everything after the first two calls is in memory.** The catalogue (520 distributors,
 * 23 menu items) and the account directory load once into root stores and are shared with
 * the Distributors screen, so status, search, sort and paging never touch the network. Only
 * a selection's grants are fetched, once each, and cached for the visit.
 */
@Component({
  selector: 'to-distributor-access',
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
    MenuGrantTreeComponent,
  ],
  templateUrl: './distributor-access.component.html',
  styleUrl: './distributor-access.component.scss',
})
export class DistributorAccessComponent implements HasUnsavedChanges {
  private readonly api = inject(Admin2DistributorAccessApi);
  private readonly distributorsApi = inject(Admin2DistributorsApi);
  private readonly catalogue = inject(DistributorAccessCatalogueStore);
  private readonly accounts = inject(DistributorAccountsStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly route = DISTRIBUTORS_ROUTE;
  protected readonly statusLabels = DISTRIBUTOR_STATUS_LABELS;
  protected readonly statusPill = DISTRIBUTOR_STATUS_PILL;
  protected readonly detailLimit = DETAIL_LIMIT;
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, index) => index);

  protected readonly loading = computed(() => !this.catalogue.loaded() && !this.catalogue.failed());
  protected readonly failed = computed(() => !this.catalogue.loaded() && this.catalogue.failed());
  protected readonly refreshing = this.catalogue.refreshing;

  /** Built once per catalogue load: display order plus parent/child links by id. */
  protected readonly index = computed(() => buildMenuIndex(this.catalogue.menus()));

  // ─── Grid ───────────────────────────────────────────────────────────────────

  protected readonly status = signal<StatusTab>('Active');
  protected readonly access = signal<AccessTab>('Any');
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

  /**
   * The catalogue joined to the account directory.
   *
   * The catalogue carries only the login, the name, the status flags and the grant count.
   * Business type, territory and city come from the Distributors screen's store — already
   * loaded for most visits, and the join is skipped rather than fatal when it is not: an
   * admin holding this menu row must still be able to read and fix access.
   */
  private readonly indexed = computed<GridRow[]>(() => {
    const byId = new Map(this.accounts.rows().map((account) => [account.distributorId, account]));

    return this.catalogue.rows().map((distributor) => {
      const account = byId.get(distributor.distributorId);
      const status: DistributorRowStatus = !distributor.isActive
        ? 'inactive'
        : account?.isLocked
          ? 'locked'
          : 'active';

      return {
        distributor,
        distributorId: distributor.distributorId,
        name: distributor.name,
        grantedMenuCount: int(distributor.grantedMenuCount),
        status,
        account,
        businessType: account?.businessType ?? '',
        territory: account?.territory ?? '',
        region: account?.region ?? '',
        area: account?.area ?? '',
        locationSecondary: [account?.region, account?.area].filter(Boolean).join(' · '),
        city: account?.city ?? '',
        haystack: [
          distributor.distributorId,
          distributor.name,
          account?.businessType,
          account?.territory,
          account?.region,
          account?.area,
          account?.city,
          account?.contact,
        ]
          .join(' ')
          .toLowerCase(),
      };
    });
  });

  protected readonly counts = computed(() => {
    let active = 0;
    let granted = 0;
    for (const row of this.indexed()) {
      if (row.distributor.isActive) {
        active++;
      }
      if (row.grantedMenuCount > 0) {
        granted++;
      }
    }
    const all = this.indexed().length;
    return { active, inactive: all - active, all, granted, none: all - granted };
  });

  protected readonly statusTabs: { key: StatusTab; label: string; hint: string }[] = [
    { key: 'Active', label: 'Active', hint: 'Can sign in to the distributor portal' },
    { key: 'Inactive', label: 'Inactive', hint: 'Deactivated — cannot sign in, but 132 of them still hold grants' },
    { key: 'All', label: 'All', hint: 'Every distributor' },
  ];

  protected readonly accessTabs: { key: AccessTab; label: string; hint: string }[] = [
    { key: 'Any', label: 'Any access', hint: 'No filter on what they hold' },
    { key: 'Granted', label: 'Has menus', hint: 'Holds at least one menu item' },
    { key: 'None', label: 'No menus', hint: 'Holds nothing — signs in to an empty portal' },
  ];

  /** Only the business types someone actually holds — an option that filters to nothing is noise. */
  protected readonly businessTypeOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const row of this.indexed()) {
      const id = int(row.account?.businessTypeId);
      if (id > 0 && !seen.has(id)) {
        seen.set(id, row.businessType || `Type ${id}`);
      }
    }
    return [...seen.entries()].sort(([a], [b]) => a - b).map(([value, label]) => ({ value, label }));
  });

  protected readonly filtered = computed(() => {
    const status = this.status();
    const access = this.access();
    const term = this.search();
    const businessTypeId = this.businessTypeId();
    const key = this.sortKey();
    const direction = this.desc() ? -1 : 1;

    return this.indexed()
      .filter((row) => {
        if (status === 'Active' && !row.distributor.isActive) return false;
        if (status === 'Inactive' && row.distributor.isActive) return false;
        if (access === 'Granted' && row.grantedMenuCount === 0) return false;
        if (access === 'None' && row.grantedMenuCount > 0) return false;
        if (businessTypeId !== null && int(row.account?.businessTypeId) !== businessTypeId) return false;
        return !term || row.haystack.includes(term);
      })
      .sort((a, b) => direction * compareRows(a, b, key));
  });

  /** Back to the first page whenever what is being paged changes. */
  protected readonly page = linkedSignal({
    source: () => [this.status(), this.access(), this.search(), this.businessTypeId(), this.sortKey(), this.desc()],
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
    return `${COUNT.format(page * PAGE_SIZE + 1)}–${COUNT.format(Math.min(total, (page + 1) * PAGE_SIZE))} of ${COUNT.format(total)}`;
  });

  protected readonly hasFilters = computed(
    () => this.search() !== '' || this.businessTypeId() !== null || this.status() !== 'All' || this.access() !== 'Any',
  );

  // ─── Selection ──────────────────────────────────────────────────────────────

  protected readonly checked = signal<ReadonlySet<string>>(new Set<string>());

  protected readonly checkedCount = computed(() => this.checked().size);

  /** Every visible row is ticked. Drives the header checkbox. */
  protected readonly allOnPageChecked = computed(() => {
    const rows = this.pageRows();
    const checked = this.checked();
    return rows.length > 0 && rows.every((row) => checked.has(row.distributorId));
  });

  protected readonly selectedRows = computed(() => {
    const checked = this.checked();
    return this.indexed()
      .filter((row) => checked.has(row.distributorId))
      .sort((a, b) => COLLATOR.compare(a.distributorId, b.distributorId));
  });

  /** Named on the panel when one distributor is selected; the count otherwise. */
  protected readonly selectionLabel = computed(() => {
    const rows = this.selectedRows();
    if (rows.length === 1) {
      return `${rows[0].name || rows[0].distributorId} · ${rows[0].distributorId}`;
    }
    return `${COUNT.format(rows.length)} distributors`;
  });

  // ─── The selection's stored grants ──────────────────────────────────────────

  /**
   * Raw stored grants per distributor, as fetched — menu ids the catalogue no longer holds
   * included, because the screen reports those rather than hiding them. Cached for the
   * visit: re-ticking a distributor does not re-fetch it.
   */
  private readonly stored = signal<ReadonlyMap<string, ReadonlySet<number>>>(new Map());
  private fetching: Subscription | null = null;
  protected readonly loadingAccess = signal(false);
  protected readonly accessFailed = signal(false);

  /** Over this many, grants are not fetched and the ticked set is applied as a template. */
  protected readonly templateMode = computed(() => this.checkedCount() > DETAIL_LIMIT);

  private readonly storedForSelected = computed<ReadonlyMap<string, ReadonlySet<number>>>(() => {
    const out = new Map<string, ReadonlySet<number>>();
    if (this.templateMode()) {
      return out;
    }
    const stored = this.stored();
    for (const row of this.selectedRows()) {
      const set = stored.get(row.distributorId);
      if (set) {
        out.set(row.distributorId, set);
      }
    }
    return out;
  });

  /** True once every selected distributor's grants are in hand. */
  protected readonly detailReady = computed(
    () => this.checkedCount() > 0 && !this.templateMode() && this.storedForSelected().size === this.checkedCount(),
  );

  protected readonly holders = computed(() => tally([...this.storedForSelected().values()]));

  protected readonly holderCount = computed(() => this.storedForSelected().size);

  // ─── The set being edited ───────────────────────────────────────────────────

  /**
   * What the tree opens on: exactly what a single distributor holds, or — for several —
   * what they all hold. The intersection is the conservative reading of "these
   * distributors", and every item only some of them hold is flagged in the tree with the
   * spread, so resolving it is a decision the admin makes and sees the cost of.
   *
   * Catalogue items only: a stored id the menu no longer has cannot be ticked, and the
   * panel says how many such grants the selection carries.
   */
  private readonly baseline = computed<ReadonlySet<number>>(() => {
    if (!this.detailReady()) {
      return new Set<number>();
    }
    return intersectionOf([...this.storedForSelected().values()], this.index());
  });

  protected readonly target = signal<ReadonlySet<number>>(new Set<number>());
  /** The admin has changed the tree. Until then, leaving the screen needs no warning. */
  protected readonly touched = signal(false);
  protected readonly saving = signal(false);
  /**
   * The set the tree was last re-based to. Comparing the target against it says whether
   * the admin's edits are still pending, which is a different question from whether a save
   * would write anything — a selection can disagree with itself before anyone touches it.
   */
  private derivedFrom: ReadonlySet<number> = new Set<number>();
  /** Set around a save, so the re-base it triggers is not reported as a discard. */
  private quietRebase = false;

  protected readonly filterControl = new FormControl('', { nonNullable: true });
  protected readonly menuFilter = signal('');

  /** Ticked ids stored without their parent — only ever inherited from what is stored. */
  protected readonly targetOrphans = computed(() => orphansIn(this.target(), this.index()));

  /**
   * Grants at least one selected distributor holds without its parent, so the portal has
   * never listed them. Flagged on their row whether or not they are still ticked.
   */
  protected readonly storedOrphanIds = computed<ReadonlySet<number>>(() => {
    const index = this.index();
    const ids = new Set<number>();
    for (const set of this.storedForSelected().values()) {
      for (const menuId of orphansIn(set, index)) {
        ids.add(menuId);
      }
    }
    return ids;
  });

  /** Stored grants pointing at menu items the catalogue no longer has. A save drops them. */
  protected readonly unknownGrants = computed(() => {
    const ids = new Set<number>();
    for (const set of this.storedForSelected().values()) {
      for (const menuId of unknownIn(set, this.index())) {
        ids.add(menuId);
      }
    }
    return [...ids].sort((a, b) => a - b);
  });

  protected readonly impact = computed(() => saveImpact(this.target(), this.storedForSelected()));

  /** Per-distributor rows for the changes block, named rather than listed by id. */
  protected readonly impactRows = computed(() => {
    const byId = new Map(this.selectedRows().map((row) => [row.distributorId, row]));
    return this.impact().changes.map((change) => ({
      ...change,
      name: byId.get(change.distributorId)?.name || change.distributorId,
    }));
  });

  /** As many as are worth reading in a panel; the rest are counted. */
  protected readonly impactPreview = computed(() => this.impactRows().slice(0, IMPACT_PREVIEW));

  protected readonly impactOverflow = computed(() => Math.max(0, this.impactRows().length - IMPACT_PREVIEW));

  /**
   * Whether a save would write anything.
   *
   * With the grants in hand this is the real diff. In template mode there is nothing to
   * diff against, so it is simply "the admin has set something" — the panel says plainly
   * that the write replaces whatever each distributor holds.
   */
  protected readonly canSave = computed(() => {
    if (this.checkedCount() === 0 || this.saving()) {
      return false;
    }
    return this.templateMode() ? this.touched() : this.impact().changes.length > 0;
  });

  protected readonly pendingSave = signal(false);

  protected readonly saveWarning = computed(() => {
    if (this.target().size === 0) {
      return `${this.selectionLabel()} will hold no menu items at all, and sign in to an empty portal.`;
    }
    if (this.templateMode()) {
      return `All ${COUNT.format(this.checkedCount())} selected distributors will hold exactly the ${COUNT.format(this.target().size)} ticked menu items, replacing whatever each of them holds now.`;
    }
    const impact = this.impact();
    return (
      `${COUNT.format(impact.changes.length)} of ${COUNT.format(this.checkedCount())} distributors change: ` +
      `${COUNT.format(impact.addedCount)} grants added, ${COUNT.format(impact.removedCount)} removed.`
    );
  });

  // ─── Row actions ────────────────────────────────────────────────────────────

  protected readonly busyId = signal<string | null>(null);
  protected readonly pendingDelete = signal<GridRow | null>(null);

  protected readonly deleteMessage = computed(() => {
    const row = this.pendingDelete();
    if (!row) {
      return '';
    }
    return (
      `${row.name || row.distributorId} (${row.distributorId}) will be deactivated: IsActive off and IsDeleted on, ` +
      'which is what the legacy Delete button did. They can no longer sign in, the account and its claims are kept, ' +
      `and their ${COUNT.format(row.grantedMenuCount)} menu grants stay as they are. There is no screen to reactivate an account.`
    );
  });

  constructor() {
    // Show what the stores already hold at once, and re-fetch only once stale.
    this.catalogue.ensureFresh();
    this.accounts.ensureFresh();

    // Fetch the grants of any newly selected distributor, once each.
    effect(() => {
      const ids = this.selectedRows().map((row) => row.distributorId);
      const template = this.templateMode();
      untracked(() => this.loadGrants(template ? [] : ids));
    });

    // Re-base the tree whenever the selection, or the grants behind it, change. Unsaved
    // ticks are dropped on purpose — the set belongs to the distributors it was opened
    // for — but never silently.
    effect(() => {
      const baseline = this.baseline();
      const ready = this.detailReady();
      const template = this.templateMode();
      untracked(() => {
        if (!ready && !template) {
          // Still loading, or nothing selected: leave the tree alone until it can be filled.
          if (this.checkedCount() === 0) {
            this.rebase(new Set<number>());
          }
          return;
        }
        const pending = this.touched() && !this.quietRebase && !sameSet(this.target(), this.derivedFrom);
        this.quietRebase = false;
        this.rebase(template ? new Set<number>() : baseline);
        if (pending) {
          this.notifications.info('Menu ticks were reset for the distributors now selected.');
        }
      });
    });
  }

  /** Points the tree at a set and marks it untouched — the one place both happen. */
  private rebase(target: ReadonlySet<number>): void {
    this.derivedFrom = target;
    this.target.set(target);
    this.touched.set(false);
  }

  hasUnsavedChanges(): boolean {
    return this.touched() && this.canSave();
  }

  // ─── Grid interaction ───────────────────────────────────────────────────────

  protected setStatus(status: StatusTab): void {
    this.status.set(status);
  }

  protected setAccess(access: AccessTab): void {
    this.access.set(access);
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
    this.access.set('Any');
  }

  protected retry(): void {
    this.catalogue.refresh();
    this.accounts.refresh();
  }

  protected isChecked(distributorId: string): boolean {
    return this.checked().has(distributorId);
  }

  protected toggleRow(distributorId: string): void {
    const next = new Set(this.checked());
    if (!next.delete(distributorId)) {
      if (next.size >= MAX_DISTRIBUTORS) {
        this.notifications.warn(
          `One save covers at most ${COUNT.format(MAX_DISTRIBUTORS)} distributors. Save these first, then select the rest.`,
        );
        return;
      }
      next.add(distributorId);
    }
    this.checked.set(next);
  }

  /** Only this one — what the row's Access action and a row click do. */
  protected selectOnly(distributorId: string): void {
    this.checked.set(new Set([distributorId]));
  }

  protected togglePage(): void {
    const rows = this.pageRows();
    const allOn = this.allOnPageChecked();
    this.checked.update((current) => {
      const next = new Set(current);
      for (const row of rows) {
        if (allOn) {
          next.delete(row.distributorId);
        } else if (next.size < MAX_DISTRIBUTORS) {
          next.add(row.distributorId);
        }
      }
      return next;
    });
  }

  /** Every row the filters leave — not just the page, which is what "Select all" means here. */
  protected selectAllFiltered(): void {
    const rows = this.filtered();
    const capped = rows.length > MAX_DISTRIBUTORS;
    this.checked.set(new Set(rows.slice(0, MAX_DISTRIBUTORS).map((row) => row.distributorId)));
    if (capped) {
      this.notifications.warn(
        `Selected the first ${COUNT.format(MAX_DISTRIBUTORS)} of ${COUNT.format(rows.length)} — one save covers no more.`,
      );
    }
  }

  protected clearSelection(): void {
    this.checked.set(new Set<string>());
  }

  // ─── The menu editor ────────────────────────────────────────────────────────

  protected onToggled(event: { menuId: number; checked: boolean }): void {
    this.target.update((current) => cascadeToggle(current, this.index(), event.menuId, event.checked));
    this.touched.set(true);
  }

  protected onSubtreeToggled(event: { menuId: number; checked: boolean }): void {
    this.target.update((current) => toggleSubtree(current, this.index(), event.menuId, event.checked));
    this.touched.set(true);
  }

  protected selectAllMenus(): void {
    this.target.set(allMenuIds(this.index()));
    this.touched.set(true);
  }

  protected selectNoMenus(): void {
    this.target.set(new Set<number>());
    this.touched.set(true);
  }

  /** Everything any of the selected distributors holds — one way to resolve the spread. */
  protected takeUnion(): void {
    this.target.set(unionOf([...this.storedForSelected().values()], this.index()));
    this.touched.set(true);
  }

  /** Only what all of them hold — the other way, and what the tree opened on. */
  protected takeIntersection(): void {
    this.target.set(intersectionOf([...this.storedForSelected().values()], this.index()));
    this.touched.set(true);
  }

  protected discard(): void {
    this.rebase(this.templateMode() ? new Set<number>() : this.baseline());
  }

  /** Ticks the parents of the hidden grants, so the portal starts listing them. */
  protected grantOrphanParents(): void {
    const index = this.index();
    this.target.update((current) => {
      let next: ReadonlySet<number> = current;
      for (const menuId of orphansIn(current, index)) {
        next = cascadeToggle(next, index, menuId, true);
      }
      return next;
    });
    this.touched.set(true);
  }

  /** Unticks the hidden grants, leaving the stored set saying what the portal shows. */
  protected revokeOrphans(): void {
    const index = this.index();
    this.target.update((current) => {
      const next = new Set(current);
      for (const menuId of orphansIn(current, index)) {
        next.delete(menuId);
      }
      return next;
    });
    this.touched.set(true);
  }

  protected requestSave(): void {
    if (this.canSave()) {
      this.pendingSave.set(true);
    }
  }

  protected confirmSave(): void {
    this.pendingSave.set(false);
    const distributorIds = this.selectedRows().map((row) => row.distributorId);
    const menuIds = [...this.target()].sort((a, b) => a - b);
    if (distributorIds.length === 0 || this.saving()) {
      return;
    }

    // Only ever true for orphans that were already stored: the editor cascades, so it
    // cannot create one. Without the flag the server would refuse to save them back.
    const allowOrphans = this.targetOrphans().length > 0;

    this.saving.set(true);
    this.api
      .replace({ distributorIds, menuIds }, allowOrphans)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const saved = intSet(response.menuIds);
          // Ahead of the writes below: patching what is stored re-bases the tree, and that
          // re-base is the saved state rather than a discard of pending ticks.
          this.quietRebase = true;
          this.touched.set(false);
          this.stored.update((current) => {
            const next = new Map(current);
            for (const id of distributorIds) {
              next.set(id, new Set(saved));
            }
            return next;
          });
          for (const id of distributorIds) {
            this.catalogue.setGrantCount(id, saved.size);
          }
          this.saving.set(false);

          const added = int(response.addedCount);
          const removed = int(response.removedCount);
          if (added === 0 && removed === 0) {
            this.notifications.info('Nothing changed — they already held exactly these menu items.');
            return;
          }
          const changed = response.distributors.filter(
            (entry) => entry.added.length > 0 || entry.removed.length > 0,
          ).length;
          this.notifications.success(
            `Access updated for ${COUNT.format(changed)} of ${COUNT.format(distributorIds.length)} ` +
              `distributor${distributorIds.length === 1 ? '' : 's'}: ` +
              `${COUNT.format(added)} granted, ${COUNT.format(removed)} revoked.`,
          );
        },
        // The error interceptor raises the toast; clearing the flag is all that is left.
        error: () => this.saving.set(false),
      });
  }

  // ─── Distributor row actions ────────────────────────────────────────────────

  protected requestDelete(row: GridRow): void {
    this.pendingDelete.set(row);
  }

  protected confirmDelete(): void {
    const row = this.pendingDelete();
    this.pendingDelete.set(null);
    if (!row) {
      return;
    }
    this.busyId.set(row.distributorId);
    this.distributorsApi
      .deactivate(row.distributorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.accounts.upsert(response.distributor);
          this.catalogue.upsert({
            ...row.distributor,
            isActive: response.distributor.isActive,
            isDeleted: response.distributor.isDeleted,
          });
          this.busyId.set(null);
          if (response.changedFields.length > 0) {
            this.notifications.success(
              `${row.name || row.distributorId} deactivated. Their menu grants are untouched.`,
            );
          } else {
            this.notifications.info(`${row.name || row.distributorId} was already inactive. Nothing changed.`);
          }
        },
        error: () => this.busyId.set(null),
      });
  }

  // ─── Loading a selection's grants ───────────────────────────────────────────

  protected retryAccess(): void {
    this.loadGrants(this.selectedRows().map((row) => row.distributorId));
  }

  /**
   * Fetches the grants of the selected distributors that are not cached yet, a few at a
   * time. One request per distributor is the only way: the catalogue carries a count, not
   * the ids, and the rest of the screen is already served from memory.
   */
  private loadGrants(distributorIds: readonly string[]): void {
    this.fetching?.unsubscribe();
    this.fetching = null;

    const stored = this.stored();
    const missing = distributorIds.filter((id) => !stored.has(id));
    if (missing.length === 0) {
      this.loadingAccess.set(false);
      this.accessFailed.set(false);
      return;
    }

    this.loadingAccess.set(true);
    this.accessFailed.set(false);
    this.fetching = from(missing)
      .pipe(
        mergeMap(
          (id) => this.api.get(id).pipe(map((access) => [id, intSet(access.menuIds)] as const)),
          FETCH_CONCURRENCY,
        ),
        // Each response is cached as it lands rather than at the end, so ticking another
        // row part-way through keeps what has already arrived instead of re-fetching it.
        tap(([id, menuIds]) =>
          this.stored.update((current) => new Map(current).set(id, menuIds)),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        complete: () => this.loadingAccess.set(false),
        // The interceptor has raised the toast; the panel offers a retry.
        error: () => {
          this.loadingAccess.set(false);
          this.accessFailed.set(true);
        },
      });
  }
}
