import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Observable, catchError, debounceTime, distinctUntilChanged, map, of, switchMap, tap } from 'rxjs';

import { int } from '../../../../core/api/api.types';
import {
  BudgetListStatus,
  BudgetPageResponse,
  BudgetShellResponse,
} from '../../../../core/api/master-data.models';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { ApprovalChainComponent } from '../../../../shared/components/approval-chain/approval-chain.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { PkrCurrencyPipe } from '../../../../shared/pipes/pkr-currency.pipe';
import { MasterDataBudgetsApi } from '../../services/master-data-budgets.api';
import {
  EDIT_BUDGET_MENU_ID,
  approvalChainOf,
  currentChainIndex,
  daysSince,
  formatDate,
  periodLabel,
  stageLabel,
  stagePill,
} from '../create-budget.util';

const PAGE_SIZE = 20;

/** How far back the Year filter reaches. The grids hold budgets from 2018 onwards. */
const YEARS_BACK = 8;

interface ListQuery {
  status: BudgetListStatus;
  year: number | null;
  search: string;
  page: number;
  /** Bumped to re-read after a save, past the page cache. */
  version: number;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; page: BudgetPageResponse }
  | { kind: 'failed' };

function cacheKey(query: Omit<ListQuery, 'version'>): string {
  return `${query.status}|${query.year ?? ''}|${query.search.toLowerCase()}|${query.page}`;
}

/**
 * The caller's own budgets — legacy's "BUDGETS PENDING FOR APPROVAL" and "BUDGETS APPROVED"
 * grids, as two tabs of one table.
 *
 * Legacy listed every budget unpaged and oldest year first (4,339 rows for one initiator).
 * Here both grids are newest first, 20 to a page, searchable by shell code or description, and
 * every page is kept for the visit, so paging back or switching tabs is instant. The tab not
 * showing is read once the visible one has arrived, so its count is on the tab without holding
 * up the first paint.
 *
 * A pending budget says where it stands — which level it waits on, whose desk it is on, and
 * for how long — and opens onto its full approval chain. Any budget can be copied into the
 * form above as a template, which is how a monthly budget is raised again.
 */
@Component({
  selector: 'to-my-budgets',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    SelectModule,
    ApprovalChainComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
    PkrCurrencyPipe,
  ],
  templateUrl: './my-budgets.component.html',
  styleUrl: './my-budgets.component.scss',
})
export class MyBudgetsComponent {
  /** The server's current year, for the Year filter. */
  readonly currentYear = input<number>(new Date().getFullYear());
  /** The last year a budget may be raised for. */
  readonly latestYear = input<number>(new Date().getFullYear() + 2);
  /** Shell codes saved on this visit — marked, and read afresh when it changes. */
  readonly createdCodes = input<ReadonlySet<string>>(new Set<string>());

  readonly reuse = output<BudgetShellResponse>();

  private readonly api = inject(MasterDataBudgetsApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly stageLabel = stageLabel;
  protected readonly stagePill = stagePill;
  protected readonly formatDate = formatDate;
  protected readonly periodLabel = periodLabel;
  protected readonly int = int;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly editBudgetRoute = `/legacy/${EDIT_BUDGET_MENU_ID}`;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly yearControl = new FormControl<number | null>(null);

  protected readonly status = signal<BudgetListStatus>('pending');
  protected readonly year = signal<number | null>(null);
  protected readonly page = signal(1);
  protected readonly expanded = signal<string | null>(null);
  private readonly version = signal(0);

  /** The search as sent: settled for 300 ms, so a request is not issued per keystroke. */
  private readonly search = signal('');

  protected readonly state = signal<LoadState>({ kind: 'loading' });
  /** The last page shown, kept on screen (dimmed) while the next one loads. */
  protected readonly shown = signal<BudgetPageResponse | null>(null);
  protected readonly totals = signal<Record<BudgetListStatus, number | null>>({ pending: null, approved: null });

  private readonly pages = new Map<string, BudgetPageResponse>();

  protected readonly canEditBudgets = computed(() => this.menuAccess.hasMenu(EDIT_BUDGET_MENU_ID));

  protected readonly yearOptions = computed(() => {
    const options: { label: string; value: number | null }[] = [{ label: 'All years', value: null }];
    for (let year = this.latestYear(); year >= this.currentYear() - YEARS_BACK; year--) {
      options.push({ label: String(year), value: year });
    }
    return options;
  });

  protected readonly filtered = computed(() => this.year() !== null || this.search().length > 0);

  protected readonly rows = computed(() => this.shown()?.items ?? []);

  protected readonly range = computed(() => {
    const page = this.shown();
    if (!page || page.items.length === 0) {
      return null;
    }
    const first = (int(page.page, 1) - 1) * int(page.pageSize, PAGE_SIZE) + 1;
    return { first, last: first + page.items.length - 1, total: int(page.totalCount) };
  });

  protected readonly hasNext = computed(() => {
    const page = this.shown();
    return !!page && page.nextPage !== null && page.nextPage !== undefined;
  });

  private readonly query = computed<ListQuery>(() => ({
    status: this.status(),
    year: this.year(),
    search: this.search(),
    page: this.page(),
    version: this.version(),
  }));

  constructor() {
    this.searchControl.valueChanges
      .pipe(
        map((text) => text.trim()),
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((text) => {
        this.search.set(text);
        this.page.set(1);
      });

    this.yearControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((year) => {
      this.year.set(year);
      this.page.set(1);
    });

    toObservable(this.query)
      .pipe(
        switchMap((query) => this.load(query)),
        takeUntilDestroyed(),
      )
      .subscribe();

    // A save on this visit: the pending grid is out of date, and the new budgets belong in view.
    let seen = 0;
    effect(() => {
      const created = this.createdCodes();
      untracked(() => {
        if (created.size === 0 || created.size === seen) {
          return;
        }
        seen = created.size;
        this.forget('pending');
        if (this.status() !== 'pending') {
          this.shown.set(null);
        }
        this.status.set('pending');
        this.page.set(1);
        this.version.update((value) => value + 1);
      });
    });
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  private load(query: ListQuery): Observable<unknown> {
    const hit = this.pages.get(cacheKey(query));
    if (hit) {
      this.show(query, hit);
      this.prefetchOther(query);
      return of(null);
    }
    this.state.set({ kind: 'loading' });
    return this.api
      .list(query.status, { year: query.year, search: query.search, page: query.page, pageSize: PAGE_SIZE })
      .pipe(
        tap((page) => {
          this.pages.set(cacheKey(query), page);
          this.show(query, page);
          this.prefetchOther(query);
        }),
        catchError(() => {
          this.state.set({ kind: 'failed' });
          return of(null);
        }),
      );
  }

  private show(query: ListQuery, page: BudgetPageResponse): void {
    this.state.set({ kind: 'ready', page });
    this.shown.set(page);
    this.totals.update((totals) => ({ ...totals, [query.status]: int(page.totalCount) }));
  }

  /** Reads the other tab's first page with the same filters, so its count is on the tab. */
  private prefetchOther(query: ListQuery): void {
    const other: BudgetListStatus = query.status === 'pending' ? 'approved' : 'pending';
    const key = cacheKey({ ...query, status: other, page: 1 });
    const hit = this.pages.get(key);
    if (hit) {
      this.totals.update((totals) => ({ ...totals, [other]: int(hit.totalCount) }));
      return;
    }
    this.api
      .list(other, { year: query.year, search: query.search, page: 1, pageSize: PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.pages.set(key, page);
          this.totals.update((totals) => ({ ...totals, [other]: int(page.totalCount) }));
        },
        error: () => undefined,
      });
  }

  private forget(status: BudgetListStatus): void {
    for (const key of [...this.pages.keys()]) {
      if (key.startsWith(`${status}|`)) {
        this.pages.delete(key);
      }
    }
    this.totals.update((totals) => ({ ...totals, [status]: null }));
  }

  // ─── Interaction ────────────────────────────────────────────────────────────

  protected setStatus(status: BudgetListStatus): void {
    if (this.status() === status) {
      return;
    }
    // Swap the rows now — the other tab's first page is usually read already — so this tab's
    // rows never sit under the other tab's columns while the switch settles.
    const hit = this.pages.get(cacheKey({ status, year: this.year(), search: this.search(), page: 1 }));
    this.shown.set(hit ?? null);
    this.status.set(status);
    this.page.set(1);
    this.expanded.set(null);
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.yearControl.setValue(null);
    // At once, rather than after the search's debounce.
    this.search.set('');
  }

  protected goTo(page: number): void {
    this.page.set(Math.max(1, page));
    this.expanded.set(null);
  }

  protected retry(): void {
    this.version.update((value) => value + 1);
  }

  protected toggle(shellCode: string): void {
    this.expanded.update((current) => (current === shellCode ? null : shellCode));
  }

  protected onReuse(event: Event, shell: BudgetShellResponse): void {
    event.stopPropagation();
    this.reuse.emit(shell);
  }

  // ─── Row helpers ────────────────────────────────────────────────────────────

  protected isNew(shell: BudgetShellResponse): boolean {
    return this.createdCodes().has(shell.shellCode);
  }

  protected periodOf(shell: BudgetShellResponse): string {
    return periodLabel({ year: int(shell.year), month: int(shell.month) });
  }

  protected waitingDays(shell: BudgetShellResponse): number | null {
    return shell.stage.startsWith('AwaitingLevel') ? daysSince(shell.initiatedOn) : null;
  }

  protected chainOf(shell: BudgetShellResponse) {
    return approvalChainOf(shell);
  }

  protected chainIndexOf(shell: BudgetShellResponse): number {
    return currentChainIndex(shell);
  }

  protected amountChanged(shell: BudgetShellResponse): boolean {
    return int(shell.amount) !== int(shell.originalAmount);
  }
}
