import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  SaveTradeOfferCriterionRequest,
  SaveTradeOfferMechanicsRequest,
  SaveTradeOfferSchemeRequest,
  SaveTradeOfferSlabRequest,
  SubmitTradeOfferResponse,
  TradeOfferApprovalCheck,
  TradeOfferBudgetShell,
  TradeOfferCatalogueResponse,
  TradeOfferMechanics,
  TradeOfferOption,
  TradeOfferScheme,
  TradeOfferSchemePage,
} from '../../../core/api/initiate.models';
import { refusalsSilent } from '../../../core/interceptors/error.interceptor';

const BASE = '/initiate/trade-offers';

/**
 * How long reference data is reused. The catalogue and a criterion's options change rarely
 * (a new distributor, a new master SKU), and schemes are defined in runs — 84% of them since
 * 2025 were saved within ten minutes of the same user's previous one — so reusing them makes
 * every scheme after the first cost no reads. Bounded, because the catalogue carries today's
 * date, the earliest a scheme may start. The server re-checks every value on save.
 */
const REFERENCE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  at: number;
  value$: Observable<T>;
}

function normaliseCatalogue(wire: TradeOfferCatalogueResponse): TradeOfferCatalogueResponse {
  return {
    ...wire,
    discountTypes: asList(wire?.discountTypes),
    schemeTypes: asList(wire?.schemeTypes),
    claimTypes: asList(wire?.claimTypes),
    criteria: asList(wire?.criteria),
    databases: asList(wire?.databases),
  };
}

function normaliseScheme(wire: TradeOfferScheme): TradeOfferScheme {
  return {
    ...wire,
    slabs: asList(wire?.slabs),
    criteria: asList(wire?.criteria).map((criterion) => ({ ...criterion, values: asList(criterion.values) })),
    approvalSteps: asList(wire?.approvalSteps),
  };
}

/**
 * `Initiate / Trade Offer - in Litres` — replaces `Based_Weight_Return_In_Value.aspx`.
 *
 * Every write answers with the whole scheme, so the screen never re-reads it after a save.
 * Writes, the calculation and the approval check report refusals in place — on the card that
 * made them — rather than as toasts; a server fault or an expired session still toasts.
 */
@Injectable({ providedIn: 'root' })
export class TradeOffersApi {
  private readonly api = inject(ApiClient);

  private readonly cache = new Map<string, CacheEntry<unknown>>();

  // ─── Reference data ─────────────────────────────────────────────────────────

  catalogue(): Observable<TradeOfferCatalogueResponse> {
    return this.cached('catalogue', () =>
      this.api
        .get<TradeOfferCatalogueResponse | { data: TradeOfferCatalogueResponse }>(`${BASE}/catalogue`)
        .pipe(map(unwrapData), map(normaliseCatalogue)),
    );
  }

  /**
   * What the caller may pick for one criterion. POP is listed one distributor at a time;
   * `prevPopCode` narrows it to the outlet with that previous POP code.
   */
  options(criterion: string, distributor?: string | null, prevPopCode?: string | null): Observable<TradeOfferOption[]> {
    const prev = prevPopCode?.trim() || '';
    const key = `options:${criterion}:${distributor ?? ''}:${prev}`;
    return this.cached(key, () =>
      this.api
        .get<TradeOfferOption[] | { data: TradeOfferOption[] }>(
          `${BASE}/criteria/${encodeURIComponent(criterion)}/options`,
          { distributor: distributor || undefined, prevPopCode: prev || undefined },
          refusalsSilent(),
        )
        .pipe(
          map(unwrapData),
          map((rows) => asList(rows)),
        ),
    );
  }

  /** Starts loading a criterion's options without waiting — hovering it is hint enough. */
  prefetchOptions(criterion: string): void {
    this.options(criterion).subscribe({ error: () => undefined });
  }

  // ─── Schemes ────────────────────────────────────────────────────────────────

  /** The caller's editable schemes, newest first. Never cached: every save changes it. */
  schemes(search: string, page = 1, pageSize = 50): Observable<TradeOfferSchemePage> {
    return this.api
      .get<TradeOfferSchemePage>(`${BASE}/schemes`, { search: search.trim() || undefined, page, pageSize })
      .pipe(map((wire) => ({ ...wire, items: asList(wire?.items) })));
  }

  scheme(sequenceId: string): Observable<TradeOfferScheme> {
    return this.api
      .get<TradeOfferScheme | { data: TradeOfferScheme }>(`${BASE}/schemes/${encodeURIComponent(sequenceId)}`, undefined, refusalsSilent())
      .pipe(map(unwrapData), map(normaliseScheme));
  }

  create(request: SaveTradeOfferSchemeRequest): Observable<TradeOfferScheme> {
    return this.write(this.api.post(`${BASE}/schemes`, request, undefined, refusalsSilent()));
  }

  update(sequenceId: string, request: SaveTradeOfferSchemeRequest): Observable<TradeOfferScheme> {
    return this.write(this.api.put(this.path(sequenceId), request, undefined, refusalsSilent()));
  }

  // ─── Slab ───────────────────────────────────────────────────────────────────

  addSlab(sequenceId: string, request: SaveTradeOfferSlabRequest): Observable<TradeOfferScheme> {
    return this.write(this.api.post(`${this.path(sequenceId)}/slabs`, request, undefined, refusalsSilent()));
  }

  updateSlab(sequenceId: string, serialNo: number, request: SaveTradeOfferSlabRequest): Observable<TradeOfferScheme> {
    return this.write(this.api.put(`${this.path(sequenceId)}/slabs/${serialNo}`, request, undefined, refusalsSilent()));
  }

  deleteSlab(sequenceId: string, serialNo: number): Observable<TradeOfferScheme> {
    return this.write(this.api.delete(`${this.path(sequenceId)}/slabs/${serialNo}`, undefined, refusalsSilent()));
  }

  // ─── Criteria ───────────────────────────────────────────────────────────────

  /** Legacy's "Select Criteria": the default Perfect Store criterion, when there is none. */
  seedCriteria(sequenceId: string): Observable<TradeOfferScheme> {
    return this.write(this.api.post(`${this.path(sequenceId)}/criteria/defaults`, null, undefined, refusalsSilent()));
  }

  saveCriterion(sequenceId: string, criterion: string, request: SaveTradeOfferCriterionRequest): Observable<TradeOfferScheme> {
    return this.write(
      this.api.put(
        `${this.path(sequenceId)}/criteria/${encodeURIComponent(criterion)}`,
        request,
        undefined,
        refusalsSilent(),
      ),
    );
  }

  // ─── Mechanics ──────────────────────────────────────────────────────────────

  budgetShells(sequenceId: string): Observable<TradeOfferBudgetShell[]> {
    return this.api
      .get<TradeOfferBudgetShell[] | { data: TradeOfferBudgetShell[] }>(
        `${this.path(sequenceId)}/budget-shells`,
        undefined,
        refusalsSilent(),
      )
      .pipe(
        map(unwrapData),
        map((rows) => asList(rows)),
      );
  }

  /** Gross profit per litre, total discount and the rest, without saving. */
  calculate(sequenceId: string, budgetShellCode?: string | null): Observable<TradeOfferMechanics> {
    return this.api
      .get<TradeOfferMechanics | { data: TradeOfferMechanics }>(
        `${this.path(sequenceId)}/mechanics/calculation`,
        { budgetShellCode: budgetShellCode || undefined },
        refusalsSilent(),
      )
      .pipe(map(unwrapData));
  }

  /** `database` is sent only when the server lists the systems; otherwise it saves its default. */
  saveMechanics(sequenceId: string, budgetShellCode: string, database: string | null): Observable<TradeOfferScheme> {
    const body: SaveTradeOfferMechanicsRequest = database ? { budgetShellCode, database } : { budgetShellCode };
    return this.write(this.api.put(`${this.path(sequenceId)}/mechanics`, body, undefined, refusalsSilent()));
  }

  // ─── Approval ───────────────────────────────────────────────────────────────

  approvalCheck(sequenceId: string): Observable<TradeOfferApprovalCheck> {
    return this.api
      .get<TradeOfferApprovalCheck | { data: TradeOfferApprovalCheck }>(
        `${this.path(sequenceId)}/approval-check`,
        undefined,
        refusalsSilent(),
      )
      .pipe(
        map(unwrapData),
        map((wire) => ({ ...wire, issues: asList(wire?.issues), approvers: asList(wire?.approvers) })),
      );
  }

  submit(sequenceId: string, forwardToUserId: string): Observable<SubmitTradeOfferResponse> {
    return this.api
      .post<SubmitTradeOfferResponse | { data: SubmitTradeOfferResponse }>(
        `${this.path(sequenceId)}/submit`,
        { forwardToUserId },
        undefined,
        refusalsSilent(),
      )
      .pipe(
        map(unwrapData),
        map((wire) => ({ ...wire, scheme: normaliseScheme(wire.scheme) })),
      );
  }

  // ─── Plumbing ───────────────────────────────────────────────────────────────

  private path(sequenceId: string): string {
    return `${BASE}/schemes/${encodeURIComponent(sequenceId)}`;
  }

  private write(request: Observable<unknown>): Observable<TradeOfferScheme> {
    return request.pipe(
      map((body) => unwrapData(body as TradeOfferScheme | { data: TradeOfferScheme })),
      map(normaliseScheme),
    );
  }

  /** A shared, time-limited copy of `load()`; a failed load is forgotten so the next caller retries. */
  private cached<T>(key: string, load: () => Observable<T>): Observable<T> {
    const hit = this.cache.get(key) as CacheEntry<T> | undefined;
    if (hit && Date.now() - hit.at < REFERENCE_TTL_MS) {
      return hit.value$;
    }
    const entry: CacheEntry<T> = {
      at: Date.now(),
      value$: load().pipe(
        catchError((error: unknown) => {
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
