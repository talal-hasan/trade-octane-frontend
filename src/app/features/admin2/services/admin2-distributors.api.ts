import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  CreateDistributorRequest,
  DistributorAccountCatalogueResponse,
  DistributorAccountResponse,
  DistributorAccountWriteResponse,
  DistributorCandidateResponse,
  DistributorStatusFilter,
  UpdateDistributorRequest,
} from '../../../core/api/admin2.models';

const BASE = '/admin2/distributors';

/**
 * Forces every list in the catalogue to be a real array, at the boundary — the same
 * scalar-vs-collection drift `asList` exists for. A region with one area must not arrive
 * as a bare object and blank the cascade.
 */
function normaliseCatalogue(wire: DistributorAccountCatalogueResponse): DistributorAccountCatalogueResponse {
  return {
    businessTypes: asList(wire?.businessTypes),
    regions: asList(wire?.regions).map((region) => ({
      ...region,
      areas: asList(region.areas).map((area) => ({
        ...area,
        territories: asList(area.territories),
      })),
    })),
  };
}

function path(distributorId: string): string {
  return `${BASE}/${encodeURIComponent(distributorId)}`;
}

/** `Administration 2.0 / Create Distributor` — replaces `CPS_CreateDistributor.aspx`. */
@Injectable({ providedIn: 'root' })
export class Admin2DistributorsApi {
  private readonly api = inject(ApiClient);

  private catalogue$: Observable<DistributorAccountCatalogueResponse> | null = null;

  /**
   * Business types and the region → area → territory tree, in one call.
   *
   * Cached for the session: it is reference data from the geography master, and the form
   * is opened repeatedly while onboarding a batch of distributors. A failed load is not
   * cached, so the next open tries again.
   */
  catalogue(): Observable<DistributorAccountCatalogueResponse> {
    if (!this.catalogue$) {
      this.catalogue$ = this.api
        .get<DistributorAccountCatalogueResponse | { data: DistributorAccountCatalogueResponse }>(
          `${BASE}/catalogue`,
        )
        .pipe(
          map(unwrapData),
          map(normaliseCatalogue),
          catchError((error: unknown) => {
            this.catalogue$ = null;
            return throwError(() => error);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.catalogue$;
  }

  /**
   * Master distributors with no account yet. Not cached: every create removes one, and
   * offering a distributor that already has an account is the legacy defect this replaces.
   */
  candidates(search?: string): Observable<DistributorCandidateResponse[]> {
    return this.api
      .get<DistributorCandidateResponse[] | { data: DistributorCandidateResponse[] }>(
        `${BASE}/candidates`,
        { search },
      )
      .pipe(map(unwrapData), map((rows) => asList(rows)));
  }

  list(status: DistributorStatusFilter = 'Active'): Observable<DistributorAccountResponse[]> {
    return this.api
      .get<DistributorAccountResponse[] | { data: DistributorAccountResponse[] }>(BASE, { status })
      .pipe(map(unwrapData), map((rows) => asList(rows)));
  }

  get(distributorId: string): Observable<DistributorAccountResponse> {
    return this.api
      .get<DistributorAccountResponse | { data: DistributorAccountResponse }>(path(distributorId))
      .pipe(map(unwrapData));
  }

  /** Created active and unlocked. The name is taken from the master, not the request. */
  create(request: CreateDistributorRequest): Observable<DistributorAccountResponse> {
    return this.api
      .post<DistributorAccountResponse | { data: DistributorAccountResponse }>(BASE, request)
      .pipe(map(unwrapData));
  }

  /** Omit `password` to keep it. An unchanged save writes nothing: `changedFields` is empty. */
  update(distributorId: string, request: UpdateDistributorRequest): Observable<DistributorAccountWriteResponse> {
    return this.api.put<DistributorAccountWriteResponse>(path(distributorId), request);
  }

  /** The legacy Delete: `IsActive = 0`, `IsDeleted = 1`. The account and its claims stay. */
  deactivate(distributorId: string): Observable<DistributorAccountWriteResponse> {
    return this.api.post<DistributorAccountWriteResponse>(`${path(distributorId)}/deactivate`);
  }

  /**
   * The inverse of `deactivate`: `IsActive = 1`, `IsDeleted = 0`.
   *
   * **No legacy equivalent** — that screen could deactivate and never reinstate. Added
   * 2026-09-21 alongside the client's rule that an inactive account cannot be edited: this
   * is the "activate it first" the rule tells people to do, and without it a deactivated
   * distributor would be frozen for good.
   */
  activate(distributorId: string): Observable<DistributorAccountWriteResponse> {
    return this.api.post<DistributorAccountWriteResponse>(`${path(distributorId)}/activate`);
  }

  lock(distributorId: string): Observable<DistributorAccountWriteResponse> {
    return this.api.post<DistributorAccountWriteResponse>(`${path(distributorId)}/lock`);
  }

  unlock(distributorId: string): Observable<DistributorAccountWriteResponse> {
    return this.api.post<DistributorAccountWriteResponse>(`${path(distributorId)}/unlock`);
  }
}
