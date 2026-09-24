import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable, catchError, forkJoin, fromEvent, map, of } from 'rxjs';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { int } from '../../../core/api/api.types';
import { ApproveBudgetCatalogueResponse, ApproveBudgetDecisionResponse } from '../../../core/api/approve.models';
import { MenuAccessService } from '../../../core/services/menu-access.service';
import { ApprovalChainComponent } from '../../../shared/components/approval-chain/approval-chain.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { PkrCurrencyPipe } from '../../../shared/pipes/pkr-currency.pipe';
import { ApproveBudgetsApi, ApproveBudgetQueue } from '../services/approve-budgets.api';
import {
  BudgetRow,
  DecisionRefusal,
  QUEUE_ORDER,
  RowSort,
  SortKey,
  approvalChainOf,
  currentChainIndex,
  filterRows,
  formatDate,
  forwardPreferenceKey,
  levelLabel,
  outcomeLabel,
  outcomeNote,
  outcomePill,
  refusalOf,
  sortRows,
  toRow,
  waitingLabel,
  writePreference,
} from './approve-budgets.util';
import { DecisionPanelComponent, DecisionReceipt, DecisionRequest } from './decision-panel/decision-panel.component';

/** In-memory pages: the queue is held whole, this only bounds the DOM. */
const PAGE_SIZE = 50;

/** A tab left in the background this long is re-read when it comes back into view. */
const STALE_AFTER_MS = 2 * 60 * 1000;

type LoadState = 'loading' | 'ready' | 'failed';

/** A budget type chip: the catalogue's types, each with what waits in the queue now. */
interface TypeChip {
  key: string;
  name: string;
  count: number;
}

/**
 * Approve → Budgets (MenuID 40), replacing `Approve_Budget.aspx` — "Pending Budgets for
 * Approvals".
 *
 * Queue mode (CLAUDE.md §7): the budgets waiting on the caller on the left, the decision on
 * the right, so a batch is approved or sent back without leaving the list.
 *
 * What changed from legacy, and why:
 *
 * - **Every budget type at once.** Legacy showed one Budget Type at a time and an empty grid
 *   until one was picked. The queue opens on everything waiting, with a chip per type and its
 *   count; one click narrows it, and the choice is kept in the URL.
 * - **Every level the approver holds.** Legacy read one level per user (`Rows[0]` of an
 *   unordered DISTINCT), so the seven BRD users holding levels 2 and 3 only ever saw one.
 * - **The effect is stated before the click.** The panel says which budgets move up a level
 *   and to whom, which are finally approved, and whose desk a rejection lands on. Forward To
 *   only offers someone who can take every ticked budget, and never the person who raised one.
 * - **A receipt, not "Data Accepted".** Each budget's own outcome, including one decided
 *   elsewhere in the meantime, and whether its email went.
 * - **Fast.** Two requests on load (catalogue and queue, in parallel); filters, search,
 *   sort and paging run in memory. A decision removes its rows at once and re-reads quietly.
 */
@Component({
  selector: 'to-approve-budgets',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    ApprovalChainComponent,
    EmptyStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    PkrCurrencyPipe,
    DecisionPanelComponent,
  ],
  templateUrl: './approve-budgets.component.html',
  styleUrl: './approve-budgets.component.scss',
})
export class ApproveBudgetsComponent {
  private readonly api = inject(ApproveBudgetsApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  protected readonly icons = ICON_REGISTRY;
  protected readonly levelLabel = levelLabel;
  protected readonly waitingLabel = waitingLabel;
  protected readonly formatDate = formatDate;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  // ─── Loaded state ───────────────────────────────────────────────────────────

  protected readonly catalogue = signal<ApproveBudgetCatalogueResponse | null>(null);
  protected readonly catalogueState = signal<LoadState>('loading');
  protected readonly rows = signal<BudgetRow[]>([]);
  protected readonly queueState = signal<LoadState>('loading');
  /** What the server counts; more than the rows held only past the service's page cap. */
  protected readonly serverCount = signal(0);
  /** A quiet re-read is running; the grid stays usable. */
  protected readonly refreshing = signal(false);
  private readonly loadedAt = signal(0);

  // ─── View state ─────────────────────────────────────────────────────────────

  protected readonly typeKey = signal<string | null>(null);
  protected readonly level = signal<number | null>(null);
  protected readonly search = signal('');
  protected readonly sort = signal<RowSort>(QUEUE_ORDER);
  protected readonly page = signal(1);
  protected readonly expanded = signal<string | null>(null);
  protected readonly selected = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly exporting = signal(false);

  // ─── Decision state ─────────────────────────────────────────────────────────

  protected readonly deciding = signal<DecisionRequest['action'] | null>(null);
  protected readonly receipt = signal<DecisionReceipt | null>(null);
  protected readonly refusal = signal<DecisionRefusal | null>(null);
  /** The last request, kept so a "busy" refusal can be retried as it was. */
  private lastRequest: DecisionRequest | null = null;

  // ─── Derived ────────────────────────────────────────────────────────────────

  protected readonly notAnApprover = computed(
    () => this.catalogueState() === 'ready' && (this.catalogue()?.budgetTypes.length ?? 0) === 0,
  );

  protected readonly typeChips = computed<TypeChip[]>(() => {
    const counts = new Map<string, number>();
    const names = new Map<string, string>();
    for (const row of this.rows()) {
      counts.set(row.schemeGroupKey, (counts.get(row.schemeGroupKey) ?? 0) + 1);
      if (!names.has(row.schemeGroupKey)) {
        names.set(row.schemeGroupKey, row.schemeGroup || row.schemeGroupKey);
      }
    }
    const chips: TypeChip[] = (this.catalogue()?.budgetTypes ?? []).map((type) => ({
      key: type.schemeGroupKey,
      name: type.name || type.schemeGroupKey,
      count: counts.get(type.schemeGroupKey) ?? 0,
    }));
    // A budget of a type the catalogue no longer lists still gets a chip, so it can be found.
    for (const [key, count] of counts) {
      if (!chips.some((chip) => chip.key === key)) {
        chips.push({ key, name: names.get(key) ?? key, count });
      }
    }
    return chips;
  });

  /** The levels the caller signs at within the chosen type — the level chips, when several. */
  protected readonly levelChips = computed(() => {
    const key = this.typeKey();
    const levels = new Set<number>();
    for (const type of this.catalogue()?.budgetTypes ?? []) {
      if (key === null || type.schemeGroupKey === key) {
        type.levels.forEach((level) => levels.add(int(level.level)));
      }
    }
    for (const row of this.rows()) {
      if (key === null || row.schemeGroupKey === key) {
        levels.add(row.level);
      }
    }
    const byType = this.rows().filter((row) => key === null || row.schemeGroupKey === key);
    return [...levels]
      .sort((a, b) => a - b)
      .map((level) => ({ level, count: byType.filter((row) => row.level === level).length }));
  });

  protected readonly visible = computed(() =>
    sortRows(filterRows(this.rows(), { typeKey: this.typeKey(), level: this.level(), search: this.search() }), this.sort()),
  );

  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.visible().length / PAGE_SIZE)));

  protected readonly pageRows = computed(() => {
    const page = Math.min(this.page(), this.pageCount());
    return this.visible().slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  });

  protected readonly range = computed(() => {
    const total = this.visible().length;
    if (total === 0) {
      return null;
    }
    const first = (Math.min(this.page(), this.pageCount()) - 1) * PAGE_SIZE + 1;
    return { first, last: first + this.pageRows().length - 1, total };
  });

  protected readonly filtered = computed(
    () => this.typeKey() !== null || this.level() !== null || this.search().length > 0,
  );

  /** The queue is longer than the service reads. Never expected; said plainly if it happens. */
  protected readonly truncated = computed(() => this.serverCount() > this.rows().length);

  /** The ticked budgets, in the grid's order. */
  protected readonly selectedRows = computed(() => {
    const codes = this.selected();
    return this.rows().filter((row) => codes.has(row.shellCode));
  });

  /** Ticked budgets the current filters hide — the panel says so, rather than acting unseen. */
  protected readonly hiddenSelected = computed(() => {
    const shown = new Set(this.visible().map((row) => row.shellCode));
    return this.selectedRows().filter((row) => !shown.has(row.shellCode)).length;
  });

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visible();
    const codes = this.selected();
    return rows.length > 0 && rows.every((row) => codes.has(row.shellCode));
  });

  protected readonly someVisibleSelected = computed(() => {
    const codes = this.selected();
    return !this.allVisibleSelected() && this.visible().some((row) => codes.has(row.shellCode));
  });

  protected readonly queueValue = computed(() => this.visible().reduce((sum, row) => sum + row.amount, 0));

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.typeKey.set(params.get('type') || null);
    const level = Number(params.get('level'));
    this.level.set(level >= 1 && level <= 3 ? level : null);

    this.searchControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((text) => {
      this.search.set(text.trim());
      this.page.set(1);
    });

    this.load(false);

    // Approvals move while a tab sits in the background: re-read on return when it is stale.
    fromEvent(this.document, 'visibilitychange')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (
          this.document.visibilityState === 'visible' &&
          Date.now() - this.loadedAt() > STALE_AFTER_MS &&
          this.deciding() === null
        ) {
          this.load(true);
        }
      });
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  /**
   * Reads the catalogue and the queue together. `quiet` keeps what is on screen while it
   * runs — a refresh, or the re-read after a decision — and keeps the ticks on budgets that
   * are still waiting.
   */
  protected load(quiet: boolean): void {
    if (quiet) {
      this.refreshing.set(true);
    } else {
      this.catalogueState.set('loading');
      this.queueState.set('loading');
    }

    forkJoin({
      catalogue: this.api.catalogue().pipe(catchError(() => of(null))),
      queue: this.api.queue().pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ catalogue, queue }) => {
        this.refreshing.set(false);
        if (catalogue) {
          this.catalogue.set(catalogue);
          this.catalogueState.set('ready');
        } else if (!quiet || !this.catalogue()) {
          this.catalogueState.set('failed');
        }
        if (queue) {
          this.applyQueue(queue);
        } else if (!quiet || this.queueState() !== 'ready') {
          this.queueState.set('failed');
        }
      });
  }

  private applyQueue(queue: ApproveBudgetQueue): void {
    const now = new Date();
    const rows = queue.items.map((item) => toRow(item, now));
    this.rows.set(rows);
    this.serverCount.set(queue.totalCount);
    this.queueState.set('ready');
    this.loadedAt.set(Date.now());

    const present = new Set(rows.map((row) => row.shellCode));
    this.selected.update((codes) => new Set([...codes].filter((code) => present.has(code))));
    if (this.expanded() && !present.has(this.expanded()!)) {
      this.expanded.set(null);
    }
  }

  // ─── Filters ────────────────────────────────────────────────────────────────

  protected setType(key: string | null): void {
    // Clicking the active chip clears it, as every filter chip in the app does.
    const next = this.typeKey() === key ? null : key;
    this.typeKey.set(next);
    // A level the new type has no budgets at would show an empty grid for no visible reason.
    if (this.level() !== null && !this.levelChips().some((chip) => chip.level === this.level() && chip.count > 0)) {
      this.level.set(null);
    }
    this.page.set(1);
    this.syncUrl();
  }

  protected setLevel(level: number | null): void {
    this.level.set(this.level() === level ? null : level);
    this.page.set(1);
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.typeKey.set(null);
    this.level.set(null);
    this.searchControl.setValue('');
    this.page.set(1);
    this.syncUrl();
  }

  protected sortBy(key: SortKey): void {
    this.sort.update((sort) =>
      sort.key === key
        ? { key, descending: !sort.descending }
        : // Biggest amount and the latest period first; the queue itself longest waiting first.
          { key, descending: true },
    );
    this.page.set(1);
  }

  protected sortState(key: SortKey): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    return sort.key !== key ? 'none' : sort.descending ? 'descending' : 'ascending';
  }

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
    this.expanded.set(null);
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { type: this.typeKey() ?? null, level: this.level() ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  protected isSelected(row: BudgetRow): boolean {
    return this.selected().has(row.shellCode);
  }

  protected toggleRow(row: BudgetRow): void {
    this.selected.update((codes) => {
      const next = new Set(codes);
      if (!next.delete(row.shellCode)) {
        next.add(row.shellCode);
      }
      return next;
    });
    this.receipt.set(null);
    this.refusal.set(null);
  }

  /** The header box: every budget the filters show, on every page, or none of them. */
  protected toggleAllVisible(): void {
    const visible = this.visible().map((row) => row.shellCode);
    this.selected.update((codes) => {
      const next = new Set(codes);
      if (this.allVisibleSelected()) {
        visible.forEach((code) => next.delete(code));
      } else {
        visible.forEach((code) => next.add(code));
      }
      return next;
    });
    this.receipt.set(null);
    this.refusal.set(null);
  }

  protected unselect(shellCode: string): void {
    this.selected.update((codes) => {
      const next = new Set(codes);
      next.delete(shellCode);
      return next;
    });
  }

  protected clearSelection(): void {
    this.selected.set(new Set<string>());
    this.refusal.set(null);
  }

  protected toggleExpanded(row: BudgetRow): void {
    this.expanded.update((current) => (current === row.shellCode ? null : row.shellCode));
  }

  // ─── Row helpers ────────────────────────────────────────────────────────────

  protected chainOf(row: BudgetRow) {
    return approvalChainOf(row);
  }

  protected chainIndexOf(row: BudgetRow): number {
    return currentChainIndex(row);
  }

  /** Scheme groups are mostly named after their types; the group only where it adds something. */
  protected groupNote(row: BudgetRow): string {
    return row.schemeGroup && row.schemeGroup.toLowerCase() !== row.schemeType.toLowerCase() ? row.schemeGroup : '';
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  /** Send to Excel: the server's CSV with exactly the grid's filters. */
  protected exportCsv(): void {
    if (this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api
      .exportPending({ schemeGroupKey: this.typeKey(), level: this.level(), search: this.search() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('pending-budgets'));
          this.exporting.set(false);
        },
        // The error interceptor has shown why.
        error: () => this.exporting.set(false),
      });
  }

  // ─── The decision ───────────────────────────────────────────────────────────

  protected decide(request: DecisionRequest): void {
    if (this.deciding() !== null) {
      return;
    }
    const rows = this.selectedRows();
    if (rows.length === 0) {
      return;
    }
    this.lastRequest = request;
    this.deciding.set(request.action);
    this.refusal.set(null);
    this.receipt.set(null);

    const shellCodes = rows.map((row) => row.shellCode);
    const call: Observable<ApproveBudgetDecisionResponse> =
      request.action === 'accept'
        ? this.api.accept({ shellCodes, forwardToUserId: request.forwardToUserId || null })
        : this.api.reject({ shellCodes });

    call
      .pipe(
        map((response) => ({ response, error: null as unknown })),
        catchError((error: unknown) => of({ response: null, error })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ response, error }) => {
        this.deciding.set(null);
        if (response) {
          this.applyDecision(request, rows, response);
        } else {
          this.applyRefusal(refusalOf(error));
        }
      });
  }

  protected retryDecision(): void {
    if (this.lastRequest) {
      this.decide(this.lastRequest);
    }
  }

  protected dismissReceipt(): void {
    this.receipt.set(null);
  }

  private applyDecision(request: DecisionRequest, rows: BudgetRow[], response: ApproveBudgetDecisionResponse): void {
    const byCode = new Map(rows.map((row) => [row.shellCode.toUpperCase(), row]));
    const lines = response.items.map((item) => {
      const row = byCode.get(item.shellCode.toUpperCase()) ?? null;
      return {
        shellCode: item.shellCode,
        outcome: item.outcome,
        label: outcomeLabel(item.outcome),
        pill: outcomePill(item.outcome),
        note: outcomeNote(item),
        amount: row?.amount ?? null,
        detail: row ? `${row.regionName} · ${row.period}` : '',
      };
    });

    this.receipt.set({
      action: request.action,
      actedOn: int(response.actedOn),
      skipped: int(response.skipped),
      decidedOn: response.decidedOn ?? null,
      lines,
    });

    // Every budget named in the response has left this queue: decided now, or already
    // decided elsewhere. Removing them now keeps the grid honest before the re-read lands.
    const gone = new Set(response.items.map((item) => item.shellCode.toUpperCase()));
    for (const row of rows) {
      gone.add(row.shellCode.toUpperCase());
    }
    this.rows.update((all) => all.filter((row) => !gone.has(row.shellCode.toUpperCase())));
    this.selected.set(new Set<string>());
    if (this.expanded() && gone.has(this.expanded()!.toUpperCase())) {
      this.expanded.set(null);
    }
    this.page.update((page) => Math.min(page, this.pageCount()));

    if (request.action === 'accept' && request.forwardToUserId) {
      const userId = this.menuAccess.userId();
      const forwarded = new Set(
        response.items.filter((item) => item.outcome === 'Forwarded').map((item) => item.shellCode.toUpperCase()),
      );
      for (const row of rows) {
        if (forwarded.has(row.shellCode.toUpperCase())) {
          writePreference(userId, forwardPreferenceKey(row.schemeGroupKey, row.level), request.forwardToUserId);
        }
      }
    }

    this.load(true);
  }

  private applyRefusal(refusal: DecisionRefusal): void {
    this.refusal.set(refusal);
    // The Forward To list or the caller's levels changed under the screen: read them again.
    if (refusal.staleForwardTo || refusal.code === 'not_an_approver') {
      this.load(true);
    }
  }
}
