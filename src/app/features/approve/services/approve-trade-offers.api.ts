import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, shareReplay, switchMap, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, int, unwrapData } from '../../../core/api/api.types';
import {
  ApproveTradeOfferAcceptRequest,
  ApproveTradeOfferCatalogueResponse,
  ApproveTradeOfferDecisionResponse,
  ApproveTradeOfferDetailResponse,
  ApproveTradeOfferPageResponse,
  ApproveTradeOfferQuery,
  ApproveTradeOfferRejectRequest,
  ApproveTradeOfferResponse,
} from '../../../core/api/approve.models';
import { refusalsSilent } from '../../../core/interceptors/error.interceptor';

const BASE = '/approve/trade-offers';

/** The server's page-size ceiling: a larger request is clamped to it. */
const PAGE_SIZE = 200;

/** At 200 a page, 2,000 schemes. A queue past it is shown as incomplete rather than read forever. */
const MAX_PAGES = 10;

/** How many scheme views are kept for the visit. Each is a few kilobytes. */
const MAX_DETAILS = 60;

/** Every scheme waiting on the caller, as far as {@link MAX_PAGES} reaches. */
export interface ApproveTradeOfferQueue {
  items: ApproveTradeOfferResponse[];
  /** What the server counts: more than `items.length` only past the page cap. */
  totalCount: number;
}

function normaliseCatalogue(wire: ApproveTradeOfferCatalogueResponse): ApproveTradeOfferCatalogueResponse {
  return {
    ...wire,
    levels: asList(wire?.levels),
    forwardTo: asList(wire?.forwardTo),
    salesfloAvailable: wire?.salesfloAvailable !== false,
  };
}

function normalisePage(wire: ApproveTradeOfferPageResponse): ApproveTradeOfferPageResponse {
  return {
    ...wire,
    items: asList(wire?.items).map((item) => ({ ...item, approvalSteps: asList(item.approvalSteps) })),
  };
}

function normaliseDetail(wire: ApproveTradeOfferDetailResponse): ApproveTradeOfferDetailResponse {
  return {
    ...wire,
    slabs: asList(wire?.slabs),
    criteria: asList(wire?.criteria).map((criterion) => ({ ...criterion, values: asList(criterion.values) })),
    approvalSteps: asList(wire?.approvalSteps),
  };
}

function normaliseDecision(wire: ApproveTradeOfferDecisionResponse): ApproveTradeOfferDecisionResponse {
  return { ...wire, items: asList(wire?.items) };
}

/** `Approve / Trade Offers` — replaces `Approve_Scheme.aspx` and its View link, `View_TradePromotions.aspx`. */
@Injectable({ providedIn: 'root' })
export class ApproveTradeOffersApi {
  private readonly api = inject(ApiClient);

  /** Scheme views read on this visit. A scheme does not change while it waits on the caller. */
  private readonly details = new Map<string, Observable<ApproveTradeOfferDetailResponse>>();

  /**
   * The levels the caller signs at, their counts and totals, level 2's Forward To list, and
   * whether this host posts to Salesflo. Not cached: the counts are the point of it.
   */
  catalogue(): Observable<ApproveTradeOfferCatalogueResponse> {
    return this.api
      .get<ApproveTradeOfferCatalogueResponse | { data: ApproveTradeOfferCatalogueResponse }>(`${BASE}/catalogue`)
      .pipe(map(unwrapData), map(normaliseCatalogue));
  }

  /**
   * The whole queue, not a page of it — legacy showed it unpaged. The screen filters, searches
   * and selects in memory; the first page comes at the server's ceiling and, in the rare queue
   * longer than that, the rest are read together.
   */
  queue(): Observable<ApproveTradeOfferQueue> {
    return this.page(1).pipe(
      switchMap((first) => {
        const totalCount = int(first.totalCount, first.items.length);
        const pages = Math.min(Math.ceil(totalCount / PAGE_SIZE), MAX_PAGES);
        if (first.nextPage === null || first.nextPage === undefined || pages <= 1) {
          return of({ items: first.items, totalCount });
        }
        const rest = Array.from({ length: pages - 1 }, (_, index) => this.page(index + 2));
        return forkJoin(rest).pipe(
          map((later) => ({ items: [first, ...later].flatMap((page) => page.items), totalCount })),
        );
      }),
    );
  }

  /**
   * One scheme in full — the View link. Kept for the visit and shared while in flight, so
   * opening a scheme a second time, or after hovering its View button, costs nothing.
   */
  detail(seqId: string): Observable<ApproveTradeOfferDetailResponse> {
    const key = seqId.trim();
    const hit = this.details.get(key);
    if (hit) {
      return hit;
    }
    if (this.details.size >= MAX_DETAILS) {
      // Oldest first: a Map iterates in insertion order.
      this.details.delete(this.details.keys().next().value as string);
    }
    const detail$ = this.api
      .get<ApproveTradeOfferDetailResponse | { data: ApproveTradeOfferDetailResponse }>(
        `${BASE}/${encodeURIComponent(key)}`,
      )
      .pipe(
        map(unwrapData),
        map(normaliseDetail),
        catchError((error: unknown) => {
          // Only this entry: a newer read for the same scheme may already have replaced it.
          if (this.details.get(key) === detail$) {
            this.details.delete(key);
          }
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.details.set(key, detail$);
    return detail$;
  }

  /** Starts reading a scheme's view without waiting for it: hovering View is a strong hint. */
  prefetchDetail(seqId: string): void {
    this.detail(seqId).subscribe({ error: () => undefined });
  }

  /** Drops kept views after a decision: the schemes decided have moved on. */
  forgetDetails(seqIds?: readonly string[]): void {
    if (!seqIds) {
      this.details.clear();
      return;
    }
    seqIds.forEach((seqId) => this.details.delete(seqId.trim()));
  }

  /** Send to Excel — the same filters as the grid, unpaged, as CSV. */
  exportPending(query: ApproveTradeOfferQuery): Observable<Blob> {
    return this.api.downloadCsv(`${BASE}/pending/export`, {
      level: query.level ?? undefined,
      search: query.search?.trim() || undefined,
    });
  }

  /**
   * Signs the schemes at the caller's level. Refusals are not toasted — the decision panel
   * places them beside what they are about. A server fault or an expired session still toasts.
   */
  accept(request: ApproveTradeOfferAcceptRequest): Observable<ApproveTradeOfferDecisionResponse> {
    return this.api
      .post<ApproveTradeOfferDecisionResponse | { data: ApproveTradeOfferDecisionResponse }>(
        `${BASE}/accept`,
        request,
        undefined,
        refusalsSilent(),
      )
      .pipe(map(unwrapData), map(normaliseDecision));
  }

  /** Sends the schemes back to their initiators. Refusals as for {@link accept}. */
  reject(request: ApproveTradeOfferRejectRequest): Observable<ApproveTradeOfferDecisionResponse> {
    return this.api
      .post<ApproveTradeOfferDecisionResponse | { data: ApproveTradeOfferDecisionResponse }>(
        `${BASE}/reject`,
        request,
        undefined,
        refusalsSilent(),
      )
      .pipe(map(unwrapData), map(normaliseDecision));
  }

  private page(page: number): Observable<ApproveTradeOfferPageResponse> {
    return this.api
      .get<ApproveTradeOfferPageResponse>(`${BASE}/pending`, { page, pageSize: PAGE_SIZE })
      .pipe(map(normalisePage));
  }
}
