import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import { refusalsSilent } from '../../../core/interceptors/error.interceptor';
import {
  BudgetApproverResponse,
  BudgetCatalogueResponse,
  BudgetGridFiltersResponse,
  BudgetListQuery,
  BudgetListStatus,
  BudgetOptionResponse,
  BudgetPageResponse,
  CreateBudgetRequest,
  CreateBudgetResponse,
} from '../../../core/api/master-data.models';

const BASE = '/master-data/budgets';

/**
 * How long reference data is reused before it is read again.
 *
 * The catalogue, a criterion's options and a scheme group's approvers change rarely — a new
 * brand mapping, a new approver — and the form is opened many times a day while budgets are
 * raised in batches. Reusing them makes every open after the first instant. Bounded rather
 * than kept for the whole session, because the catalogue carries today's back-dating window
 * and a tab left open overnight must not offer yesterday's. The server checks every rule on
 * save regardless, so a stale answer can only cost a refusal, never a wrong budget.
 */
const REFERENCE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  at: number;
  value$: Observable<T>;
}

function normaliseCatalogue(wire: BudgetCatalogueResponse): BudgetCatalogueResponse {
  return {
    ...wire,
    years: asList(wire?.years),
    months: asList(wire?.months),
    regions: asList(wire?.regions),
    criteria: asList(wire?.criteria),
    schemeGroups: asList(wire?.schemeGroups).map((group) => ({
      ...group,
      schemeTypes: asList(group.schemeTypes),
    })),
  };
}

function normaliseGridFilters(wire: BudgetGridFiltersResponse): BudgetGridFiltersResponse {
  return { schemeTypes: asList(wire?.schemeTypes), regions: asList(wire?.regions) };
}

function normalisePage(wire: BudgetPageResponse): BudgetPageResponse {
  return {
    ...wire,
    items: asList(wire?.items).map((item) => ({ ...item, approvalSteps: asList(item.approvalSteps) })),
  };
}

/** `Master Data / Create Budget` — replaces `Budget.aspx`. */
@Injectable({ providedIn: 'root' })
export class MasterDataBudgetsApi {
  private readonly api = inject(ApiClient);

  private readonly cache = new Map<string, CacheEntry<unknown>>();

  /**
   * Everything the form needs on load, in one call: periods, months, regions, criteria and
   * the caller's scheme groups with their scheme types nested.
   */
  catalogue(): Observable<BudgetCatalogueResponse> {
    return this.cached('catalogue', () =>
      this.api
        .get<BudgetCatalogueResponse | { data: BudgetCatalogueResponse }>(`${BASE}/catalogue`)
        .pipe(map(unwrapData), map(normaliseCatalogue)),
    );
  }

  /** The caller's options for one criterion — the Select picker. */
  criterionValues(criterion: string): Observable<BudgetOptionResponse[]> {
    return this.cached(`values:${criterion}`, () =>
      this.api
        .get<BudgetOptionResponse[] | { data: BudgetOptionResponse[] }>(
          `${BASE}/criteria/${encodeURIComponent(criterion)}/values`,
        )
        .pipe(map(unwrapData), map((rows) => asList(rows))),
    );
  }

  /** Who a budget of one scheme group can be forwarded to — the Forward To picker. */
  approvers(schemeGroupKey: string): Observable<BudgetApproverResponse[]> {
    return this.cached(`approvers:${schemeGroupKey}`, () =>
      this.api
        .get<BudgetApproverResponse[] | { data: BudgetApproverResponse[] }>(`${BASE}/approvers`, {
          schemeGroupKey,
        })
        .pipe(map(unwrapData), map((rows) => asList(rows))),
    );
  }

  /**
   * Starts loading a picker's options without waiting for them — hovering a criterion or a
   * scheme group is a strong enough hint that it is about to be picked.
   */
  prefetchCriterionValues(criterion: string): void {
    this.criterionValues(criterion).subscribe({ error: () => undefined });
  }

  prefetchApprovers(schemeGroupKey: string): void {
    this.approvers(schemeGroupKey).subscribe({ error: () => undefined });
  }

  /** Drops a cached Forward To list, after the server said an approver is no longer on it. */
  forgetApprovers(schemeGroupKey: string): void {
    this.cache.delete(`approvers:${schemeGroupKey}`);
  }

  /**
   * The grids' Scheme type and Region filter options: whatever the caller's own budgets carry.
   * Cached like reference data; {@link forgetGridFilters} after a save, which may add one.
   */
  gridFilters(): Observable<BudgetGridFiltersResponse> {
    return this.cached('filters', () =>
      this.api
        .get<BudgetGridFiltersResponse | { data: BudgetGridFiltersResponse }>(`${BASE}/filters`)
        .pipe(map(unwrapData), map(normaliseGridFilters)),
    );
  }

  forgetGridFilters(): void {
    this.cache.delete('filters');
  }

  /** One page of the caller's approved or pending budgets, newest first. Never cached here. */
  list(status: BudgetListStatus, query: BudgetListQuery): Observable<BudgetPageResponse> {
    return this.api
      .get<BudgetPageResponse>(`${BASE}/${status}`, {
        year: query.year ?? undefined,
        schemeTypeId: query.schemeTypeId ?? undefined,
        regionCode: query.regionCode || undefined,
        search: query.search?.trim() || undefined,
        page: query.page,
        pageSize: query.pageSize,
      })
      .pipe(map(normalisePage));
  }

  /**
   * Creates one budget shell and forwards it to its first approver.
   *
   * Refusals are not toasted: a batch saves several regions one request at a time and reports
   * each outcome on its own line, where a stack of toasts would cover the lines that explain
   * them. A server fault or an expired session still toasts.
   */
  create(request: CreateBudgetRequest): Observable<CreateBudgetResponse> {
    return this.api
      .post<CreateBudgetResponse | { data: CreateBudgetResponse }>(BASE, request, undefined, refusalsSilent())
      .pipe(map(unwrapData));
  }

  /**
   * A shared, time-limited copy of `load()`. Concurrent callers share one request, and a
   * failed load is forgotten so the next caller tries again.
   */
  private cached<T>(key: string, load: () => Observable<T>): Observable<T> {
    const hit = this.cache.get(key) as CacheEntry<T> | undefined;
    if (hit && Date.now() - hit.at < REFERENCE_TTL_MS) {
      return hit.value$;
    }
    const entry: CacheEntry<T> = {
      at: Date.now(),
      value$: load().pipe(
        catchError((error: unknown) => {
          // Only this entry: a newer load for the same key may already have replaced it.
          if (this.cache.get(key) === entry) {
            this.cache.delete(key);
          }
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      ),
    };
    this.cache.set(key, entry);
    return entry.value$;
  }
}
