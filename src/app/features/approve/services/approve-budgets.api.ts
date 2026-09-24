import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map, of, switchMap } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, int, unwrapData } from '../../../core/api/api.types';
import {
  ApproveBudgetAcceptRequest,
  ApproveBudgetCatalogueResponse,
  ApproveBudgetDecisionResponse,
  ApproveBudgetPageResponse,
  ApproveBudgetQuery,
  ApproveBudgetRejectRequest,
  ApproveBudgetResponse,
} from '../../../core/api/approve.models';
import { refusalsSilent } from '../../../core/interceptors/error.interceptor';

const BASE = '/approve/budgets';

/** The server's page-size ceiling: a larger request is clamped to it. */
const PAGE_SIZE = 200;

/**
 * The most pages the queue reads. At 200 a page this is 2,000 budgets — the busiest approver
 * in the local copy has four. A queue past it is shown as incomplete rather than read forever.
 */
const MAX_PAGES = 10;

/** Every budget waiting on the caller, as far as {@link MAX_PAGES} reaches. */
export interface ApproveBudgetQueue {
  items: ApproveBudgetResponse[];
  /** What the server counts: more than `items.length` only past the page cap. */
  totalCount: number;
}

function normaliseCatalogue(wire: ApproveBudgetCatalogueResponse): ApproveBudgetCatalogueResponse {
  return {
    pendingCount: wire?.pendingCount ?? 0,
    budgetTypes: asList(wire?.budgetTypes).map((type) => ({
      ...type,
      levels: asList(type.levels).map((level) => ({ ...level, forwardTo: asList(level.forwardTo) })),
    })),
  };
}

function normalisePage(wire: ApproveBudgetPageResponse): ApproveBudgetPageResponse {
  return {
    ...wire,
    items: asList(wire?.items).map((item) => ({ ...item, approvalSteps: asList(item.approvalSteps) })),
  };
}

function normaliseDecision(wire: ApproveBudgetDecisionResponse): ApproveBudgetDecisionResponse {
  return { ...wire, items: asList(wire?.items) };
}

/** `Approve / Budgets` — replaces `Approve_Budget.aspx`. */
@Injectable({ providedIn: 'root' })
export class ApproveBudgetsApi {
  private readonly api = inject(ApiClient);

  /**
   * The budget types the caller approves, with the levels they sign at, the counts waiting,
   * and each forwarding level's Forward To list. Not cached: the counts are the point of it.
   */
  catalogue(): Observable<ApproveBudgetCatalogueResponse> {
    return this.api
      .get<ApproveBudgetCatalogueResponse | { data: ApproveBudgetCatalogueResponse }>(`${BASE}/catalogue`)
      .pipe(map(unwrapData), map(normaliseCatalogue));
  }

  /**
   * The whole queue, not a page of it.
   *
   * An approver's queue is short — legacy showed it unpaged — so the screen holds all of it
   * and filters, searches and selects in memory: switching budget type or level costs no
   * request, and "select all" means every budget shown. The first page comes at the server's
   * ceiling; in the rare queue longer than that, the rest are read together.
   */
  queue(): Observable<ApproveBudgetQueue> {
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

  /** Send to Excel — the same filters as the grid, unpaged, as CSV. */
  exportPending(query: ApproveBudgetQuery): Observable<Blob> {
    return this.api.downloadCsv(`${BASE}/pending/export`, {
      schemeGroupKey: query.schemeGroupKey || undefined,
      level: query.level ?? undefined,
      search: query.search?.trim() || undefined,
    });
  }

  /**
   * Signs the budgets at the caller's level: forwarded at levels 1 and 2, approved at 3.
   *
   * Refusals are not toasted — the decision panel places them next to what they are about
   * (the Forward To picker, the selection). A server fault or an expired session still toasts.
   */
  accept(request: ApproveBudgetAcceptRequest): Observable<ApproveBudgetDecisionResponse> {
    return this.api
      .post<ApproveBudgetDecisionResponse | { data: ApproveBudgetDecisionResponse }>(
        `${BASE}/accept`,
        request,
        undefined,
        refusalsSilent(),
      )
      .pipe(map(unwrapData), map(normaliseDecision));
  }

  /** Sends the budgets back to their initiators. Refusals as for {@link accept}. */
  reject(request: ApproveBudgetRejectRequest): Observable<ApproveBudgetDecisionResponse> {
    return this.api
      .post<ApproveBudgetDecisionResponse | { data: ApproveBudgetDecisionResponse }>(
        `${BASE}/reject`,
        request,
        undefined,
        refusalsSilent(),
      )
      .pipe(map(unwrapData), map(normaliseDecision));
  }

  private page(page: number): Observable<ApproveBudgetPageResponse> {
    return this.api
      .get<ApproveBudgetPageResponse>(`${BASE}/pending`, { page, pageSize: PAGE_SIZE })
      .pipe(map(normalisePage));
  }
}
