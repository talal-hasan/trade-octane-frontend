import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  LevelOfAuthorityCatalogueResponse,
  LevelOfAuthorityResponse,
  LevelOfAuthorityWriteRequest,
  LevelOfAuthorityWriteResponse,
} from '../../../core/api/admin2.models';

const BASE = '/admin2/level-of-authorities';

/**
 * `Administration 2.0 / Level Of Authorities` — replaces `CPS_Level_Of_Authorities.aspx`.
 *
 * No delete, deliberately: removing a row takes a role out of the approval cycle of every
 * future claim of that business type and nature — a change to who approves money, not a
 * correction. Legacy hid the button too.
 */
@Injectable({ providedIn: 'root' })
export class Admin2LevelOfAuthoritiesApi {
  private readonly api = inject(ApiClient);

  private catalogue$: Observable<LevelOfAuthorityCatalogueResponse> | null = null;

  /**
   * The three pickers. Cached for the session — business types, claim natures and the role
   * names change rarely. A failed load is not cached.
   */
  catalogue(): Observable<LevelOfAuthorityCatalogueResponse> {
    if (!this.catalogue$) {
      this.catalogue$ = this.api
        .get<LevelOfAuthorityCatalogueResponse | { data: LevelOfAuthorityCatalogueResponse }>(`${BASE}/catalogue`)
        .pipe(
          map(unwrapData),
          map((wire) => ({
            businessTypes: asList(wire?.businessTypes),
            claimNatures: asList(wire?.claimNatures),
            roles: asList(wire?.roles),
          })),
          catchError((error: unknown) => {
            this.catalogue$ = null;
            return throwError(() => error);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.catalogue$;
  }

  /** Every row. The filters are optional server-side; the screen filters in memory instead. */
  list(): Observable<LevelOfAuthorityResponse[]> {
    return this.api
      .get<LevelOfAuthorityResponse[] | { data: LevelOfAuthorityResponse[] }>(BASE)
      .pipe(map(unwrapData), map((rows) => asList(rows)));
  }

  get(levelOfAuthorityId: number): Observable<LevelOfAuthorityResponse> {
    return this.api
      .get<LevelOfAuthorityResponse | { data: LevelOfAuthorityResponse }>(`${BASE}/${levelOfAuthorityId}`)
      .pipe(map(unwrapData));
  }

  /** Refused for a deactivated role, or a business type + claim nature + role that already has a row. */
  create(request: LevelOfAuthorityWriteRequest): Observable<LevelOfAuthorityResponse> {
    return this.api
      .post<LevelOfAuthorityResponse | { data: LevelOfAuthorityResponse }>(BASE, request)
      .pipe(map(unwrapData));
  }

  /** Replaces all five fields. Affects claims raised from now on, not cycles already built. */
  update(levelOfAuthorityId: number, request: LevelOfAuthorityWriteRequest): Observable<LevelOfAuthorityWriteResponse> {
    return this.api.put<LevelOfAuthorityWriteResponse>(`${BASE}/${levelOfAuthorityId}`, request);
  }
}
