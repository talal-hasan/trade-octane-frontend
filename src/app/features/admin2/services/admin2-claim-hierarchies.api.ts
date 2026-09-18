import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  ClaimHierarchyCatalogueResponse,
  ClaimHierarchyResponse,
  ClaimHierarchyWriteResponse,
} from '../../../core/api/admin2.models';

const BASE = '/admin2/claim-hierarchies';

function normalise(wire: ClaimHierarchyResponse): ClaimHierarchyResponse {
  return { ...wire, levels: asList(wire?.levels) };
}

/**
 * `Administration 2.0 / Approval Hierarchy` — replaces `CPS_Claim_Hierarchy.aspx`. Each
 * business type has one approval order; the claim, payment recovery, vehicle maintenance,
 * promotion calculator and CCC procedures read it at every approval step.
 */
@Injectable({ providedIn: 'root' })
export class Admin2ClaimHierarchiesApi {
  private readonly api = inject(ApiClient);

  private catalogue$: Observable<ClaimHierarchyCatalogueResponse> | null = null;

  /** Business types and roles, cached for the session. A failed load is not cached. */
  catalogue(): Observable<ClaimHierarchyCatalogueResponse> {
    if (!this.catalogue$) {
      this.catalogue$ = this.api
        .get<ClaimHierarchyCatalogueResponse | { data: ClaimHierarchyCatalogueResponse }>(`${BASE}/catalogue`)
        .pipe(
          map(unwrapData),
          map((wire) => ({ businessTypes: asList(wire?.businessTypes), roles: asList(wire?.roles) })),
          catchError((error: unknown) => {
            this.catalogue$ = null;
            return throwError(() => error);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.catalogue$;
  }

  get(businessTypeId: number): Observable<ClaimHierarchyResponse> {
    return this.api
      .get<ClaimHierarchyResponse | { data: ClaimHierarchyResponse }>(`${BASE}/${businessTypeId}`)
      .pipe(map(unwrapData), map(normalise));
  }

  /** Replaces the order in one transaction; applies to documents already in approval. */
  replace(businessTypeId: number, roleIds: number[]): Observable<ClaimHierarchyWriteResponse> {
    return this.api
      .put<ClaimHierarchyWriteResponse>(`${BASE}/${businessTypeId}`, { roleIds })
      .pipe(map((response) => ({ ...response, hierarchy: normalise(response.hierarchy) })));
  }
}
