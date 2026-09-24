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
import { ApproveTradeOfferCatalogueResponse, ApproveTradeOfferDecisionResponse } from '../../../core/api/approve.models';
import { MenuAccessService } from '../../../core/services/menu-access.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { ApproveTradeOfferQueue, ApproveTradeOffersApi } from '../services/approve-trade-offers.api';
import { readScreenPreference, waitingLabel, writeScreenPreference } from '../shared/approve-common.util';
import {
  DecisionRefusal,
  QUEUE_ORDER,
  RowSort,
  SchemeRow,
  SortKey,
  filterRows,
  formatMoney,
  formatPercent,
  formatRate,
  levelLabel,
  outcomeLabel,
  outcomeNote,
  outcomePill,
  ownerIssue,
  refusalOf,
  salesfloLine,
  sortRows,
  stillWaiting,
  toRow,
} from './approve-trade-offers.util';
import {
  TradeOfferDecisionComponent,
  TradeOfferDecisionRequest,
  TradeOfferReceipt,
} from './decision-panel/trade-offer-decision.component';
import { SchemeViewComponent } from './scheme-view/scheme-view.component';

/** In-memory pages: the queue is held whole, this only bounds the DOM. */
const PAGE_SIZE = 50;

/** A tab left in the background this long is re-read when it comes back into view. */
const STALE_AFTER_MS = 2 * 60 * 1000;

/** The key the last Forward To is remembered under. */
const SCREEN = 'tradeOffers';

type LoadState = 'loading' | 'ready' | 'failed';

/**
 * Approve → Trade Offers (MenuID 5), replacing `Approve_Scheme.aspx` — "Pending Schemes for
 * Approval" — and its View link, `View_TradePromotions.aspx`.
 *
 * Queue mode (CLAUDE.md §7): the schemes waiting on the caller on the left, the decision on
 * the right, and a scheme's full view in a drawer over them.
 *
 * What changed from legacy, and why:
 *
 * - **Where each scheme goes is stated before the click.** Level 1 goes to the budget's owner
 *   by itself (legacy disabled Forward To and said nothing), level 2 to the FBP chosen here,
 *   level 3 approves and posts to Salesflo. A level 1 scheme whose owner cannot receive it,
 *   or a Salesflo scheme on a server that does not post, is flagged before it is refused.
 * - **The grid keeps what an approver decides on**: discount, per-litre, ROI and uplift (green
 *   above zero, red at or below it, as legacy coloured them), the budget and its owner, where
 *   it runs and Salesflo's last answer. Everything else of legacy's 22 columns is in the view.
 * - **View opens beside the queue** instead of a new window, is read once per visit (or
 *   already, from hovering View), shows how much of the budget is left, and can tick the scheme.
 * - **Final approvals are confirmed** — they go live — and the receipt reports each scheme,
 *   including one Salesflo refused, which stays in the queue and can be ticked again.
 * - **Fast.** Two requests on load, in parallel; level, search, sort and paging run in memory.
 */
@Component({
  selector: 'to-approve-trade-offers',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    EmptyStateComponent,
    PageHeaderComponent,
    SkeletonComponent,
    TradeOfferDecisionComponent,
    SchemeViewComponent,
  ],
  templateUrl: './approve-trade-offers.component.html',
  styleUrl: './approve-trade-offers.component.scss',
})
export class ApproveTradeOffersComponent {
  private readonly api = inject(ApproveTradeOffersApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  protected readonly icons = ICON_REGISTRY;
  protected readonly levelLabel = levelLabel;
  protected readonly waitingLabel = waitingLabel;
  protected readonly formatMoney = formatMoney;
  protected readonly formatRate = formatRate;
  protected readonly formatPercent = formatPercent;
  protected readonly salesfloLine = salesfloLine;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  // ─── Loaded state ───────────────────────────────────────────────────────────

  protected readonly catalogue = signal<ApproveTradeOfferCatalogueResponse | null>(null);
  protected readonly catalogueState = signal<LoadState>('loading');
  protected readonly rows = signal<SchemeRow[]>([]);
  protected readonly queueState = signal<LoadState>('loading');
  /** What the server counts; more than the rows held only past the service's page cap. */
  protected readonly serverCount = signal(0);
  protected readonly refreshing = signal(false);
  private readonly loadedAt = signal(0);

  // ─── View state ─────────────────────────────────────────────────────────────

  protected readonly level = signal<number | null>(null);
  protected readonly search = signal('');
  protected readonly sort = signal<RowSort>(QUEUE_ORDER);
  protected readonly page = signal(1);
  protected readonly selected = signal<ReadonlySet<string>>(new Set<string>());
  /** The scheme open in the drawer — `?scheme=`. */
  protected readonly viewing = signal<string | null>(null);
  protected readonly exporting = signal(false);

  // ─── Decision state ─────────────────────────────────────────────────────────

  protected readonly deciding = signal<TradeOfferDecisionRequest['action'] | null>(null);
  protected readonly receipt = signal<TradeOfferReceipt | null>(null);
  protected readonly refusal = signal<DecisionRefusal | null>(null);
  protected readonly rememberedForwardTo = signal('');
  private lastRequest: TradeOfferDecisionRequest | null = null;

  // ─── Derived ────────────────────────────────────────────────────────────────

  protected readonly callerId = computed(() => this.menuAccess.userId());

  protected readonly notAnApprover = computed(
    () => this.catalogueState() === 'ready' && (this.catalogue()?.levels.length ?? 0) === 0,
  );

  /** The levels the caller signs at, with what waits at each now — chips when there are several. */
  protected readonly levelChips = computed(() => {
    const levels = new Set<number>((this.catalogue()?.levels ?? []).map((entry) => int(entry.level)));
    this.rows().forEach((row) => levels.add(row.level));
    return [...levels]
      .sort((a, b) => a - b)
      .map((level) => ({ level, count: this.rows().filter((row) => row.level === level).length }));
  });

  protected readonly visible = computed(() =>
    sortRows(filterRows(this.rows(), { level: this.level(), search: this.search() }), this.sort()),
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

  protected readonly truncated = computed(() => this.serverCount() > this.rows().length);

  /** Legacy's footer: the total discount of every scheme shown. */
  protected readonly visibleDiscount = computed(() => this.visible().reduce((sum, row) => sum + row.totalDiscount, 0));

  protected readonly selectedRows = computed(() => {
    const ids = this.selected();
    return this.rows().filter((row) => ids.has(row.seqId));
  });

  protected readonly hiddenSelected = computed(() => {
    const shown = new Set(this.visible().map((row) => row.seqId));
    return this.selectedRows().filter((row) => !shown.has(row.seqId)).length;
  });

  protected readonly allVisibleSelected = computed(() => {
    const rows = this.visible();
    const ids = this.selected();
    return rows.length > 0 && rows.every((row) => ids.has(row.seqId));
  });

  protected readonly someVisibleSelected = computed(() => {
    const ids = this.selected();
    return !this.allVisibleSelected() && this.visible().some((row) => ids.has(row.seqId));
  });

  protected readonly viewingRow = computed(() => {
    const seqId = this.viewing();
    return seqId ? (this.rows().find((row) => row.seqId === seqId) ?? null) : null;
  });

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const level = Number(params.get('level'));
    this.level.set(level >= 1 && level <= 3 ? level : null);
    this.viewing.set(params.get('scheme')?.replace(/^002-/, '').trim() || null);
    this.rememberedForwardTo.set(readScreenPreference(SCREEN, this.menuAccess.userId(), 'forwardTo'));

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
   * Reads the catalogue and the queue together. `quiet` keeps what is on screen while it runs,
   * and keeps the ticks on schemes that are still waiting.
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

  private applyQueue(queue: ApproveTradeOfferQueue): void {
    const now = new Date();
    const rows = queue.items.map((item) => toRow(item, now));
    this.rows.set(rows);
    this.serverCount.set(queue.totalCount);
    this.queueState.set('ready');
    this.loadedAt.set(Date.now());

    const present = new Set(rows.map((row) => row.seqId));
    this.selected.update((ids) => new Set([...ids].filter((id) => present.has(id))));
  }

  // ─── Filters ────────────────────────────────────────────────────────────────

  protected setLevel(level: number | null): void {
    // Clicking the active chip clears it, as every filter chip in the app does.
    this.level.set(this.level() === level ? null : level);
    this.page.set(1);
    this.syncUrl();
  }

  protected clearFilters(): void {
    this.level.set(null);
    this.searchControl.setValue('');
    this.page.set(1);
    this.syncUrl();
  }

  protected sortBy(key: SortKey): void {
    this.sort.update((sort) => (sort.key === key ? { key, descending: !sort.descending } : { key, descending: true }));
    this.page.set(1);
  }

  protected sortState(key: SortKey): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    return sort.key !== key ? 'none' : sort.descending ? 'descending' : 'ascending';
  }

  protected goTo(page: number): void {
    this.page.set(Math.min(Math.max(1, page), this.pageCount()));
  }

  private syncUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { level: this.level() ?? null, scheme: this.viewing() ?? null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── The scheme view ────────────────────────────────────────────────────────

  protected openView(row: SchemeRow | string): void {
    this.viewing.set(typeof row === 'string' ? row : row.seqId);
    this.syncUrl();
  }

  protected closeView(): void {
    if (this.viewing() !== null) {
      this.viewing.set(null);
      this.syncUrl();
    }
  }

  protected prefetch(row: SchemeRow): void {
    this.api.prefetchDetail(row.seqId);
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  protected isSelected(row: SchemeRow): boolean {
    return this.selected().has(row.seqId);
  }

  protected toggle(seqId: string): void {
    this.selected.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(seqId)) {
        next.add(seqId);
      }
      return next;
    });
    this.receipt.set(null);
    this.refusal.set(null);
  }

  /** The header box: every scheme the filters show, on every page, or none of them. */
  protected toggleAllVisible(): void {
    const visible = this.visible().map((row) => row.seqId);
    const all = this.allVisibleSelected();
    this.selected.update((ids) => {
      const next = new Set(ids);
      visible.forEach((id) => (all ? next.delete(id) : next.add(id)));
      return next;
    });
    this.receipt.set(null);
    this.refusal.set(null);
  }

  protected unselect(seqIds: readonly string[]): void {
    this.selected.update((ids) => {
      const next = new Set(ids);
      seqIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  protected retick(seqIds: readonly string[]): void {
    const present = new Set(this.rows().map((row) => row.seqId));
    this.selected.set(new Set(seqIds.filter((id) => present.has(id))));
    this.receipt.set(null);
  }

  protected clearSelection(): void {
    this.selected.set(new Set<string>());
    this.refusal.set(null);
  }

  // ─── Row helpers ────────────────────────────────────────────────────────────

  protected ownerIssueOf(row: SchemeRow): string | null {
    return ownerIssue(row, this.callerId());
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  /** Send to Excel: the server's CSV with exactly the grid's filters. */
  protected exportCsv(): void {
    if (this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.api
      .exportPending({ level: this.level(), search: this.search() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('pending-trade-offers'));
          this.exporting.set(false);
        },
        // The error interceptor has shown why.
        error: () => this.exporting.set(false),
      });
  }

  // ─── The decision ───────────────────────────────────────────────────────────

  protected decide(request: TradeOfferDecisionRequest): void {
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

    const seqIds = rows.map((row) => row.seqId);
    const call: Observable<ApproveTradeOfferDecisionResponse> =
      request.action === 'accept'
        ? this.api.accept({ seqIds, forwardToUserId: request.forwardToUserId || null })
        : this.api.reject({ seqIds });

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

  private applyDecision(
    request: TradeOfferDecisionRequest,
    rows: SchemeRow[],
    response: ApproveTradeOfferDecisionResponse,
  ): void {
    const byId = new Map(rows.map((row) => [row.seqId, row]));
    const lines = response.items.map((item) => {
      const row = byId.get(item.seqId) ?? null;
      return {
        seqId: item.seqId,
        outcome: item.outcome,
        label: outcomeLabel(item.outcome),
        pill: outcomePill(item.outcome),
        note: outcomeNote(item),
        detail: row ? `${row.description || row.schemeId} · ${formatMoney(row.totalDiscount)}` : '',
        stillWaiting: stillWaiting(item.outcome) && byId.has(item.seqId),
      };
    });

    this.receipt.set({
      action: request.action,
      actedOn: int(response.actedOn),
      skipped: int(response.skipped),
      lines,
    });

    // Decided, or decided elsewhere, has left this queue. A scheme Salesflo refused, or whose
    // owner cannot receive it, still waits here and stays.
    const gone = new Set(response.items.filter((item) => !stillWaiting(item.outcome)).map((item) => item.seqId));
    this.rows.update((all) => all.filter((row) => !gone.has(row.seqId)));
    this.selected.set(new Set<string>());
    if (this.viewing() && gone.has(this.viewing()!)) {
      this.closeView();
    }
    this.page.update((page) => Math.min(page, this.pageCount()));
    // Their views have moved on: a new sign-off, or Salesflo's answer on a refused one.
    this.api.forgetDetails(response.items.map((item) => item.seqId));

    const forwarded = response.items.some((item) => item.outcome === 'Forwarded' && int(item.level) === 2);
    if (request.action === 'accept' && request.forwardToUserId && forwarded) {
      writeScreenPreference(SCREEN, this.menuAccess.userId(), 'forwardTo', request.forwardToUserId);
      this.rememberedForwardTo.set(request.forwardToUserId);
    }

    this.load(true);
  }

  private applyRefusal(refusal: DecisionRefusal): void {
    this.refusal.set(refusal);
    if (refusal.staleForwardTo) {
      this.load(true);
    }
  }
}
