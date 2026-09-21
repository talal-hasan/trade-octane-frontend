import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  UserMappingCatalogueResponse,
  UserMappingRegionRoleFilter,
  UserMappingRegionRolePageResponse,
  UserMappingRegionRoleSort,
  UserMappingRegionRolesResponse,
  UserMappingResponse,
  UserMappingUserResponse,
  UserMappingWriteRequest,
  UserMappingWriteResponse,
} from '../../../core/api/admin2.models';

const BASE = '/admin2/user-mapping';

function userPath(userId: string): string {
  return `${BASE}/users/${encodeURIComponent(userId)}`;
}

/** Every list in a mapping as a real array — see `asList`. */
function normaliseMapping(wire: UserMappingResponse): UserMappingResponse {
  return {
    ...wire,
    businessTypes: asList(wire?.businessTypes),
    regions: asList(wire?.regions),
    areas: asList(wire?.areas),
  };
}

function normaliseWrite(wire: UserMappingWriteResponse): UserMappingWriteResponse {
  return { ...wire, mapping: normaliseMapping(wire?.mapping) };
}

/**
 * `Administration 2.0 / User Mapping` — replaces `CPS_User_Mapping.aspx`. One Promo_2 account
 * holds one role, and any number of business types, regions and areas.
 */
@Injectable({ providedIn: 'root' })
export class Admin2UserMappingApi {
  private readonly api = inject(ApiClient);

  private catalogue$: Observable<UserMappingCatalogueResponse> | null = null;

  /**
   * Roles, business types, and active regions with their areas nested. Cached for the
   * session — the geography and the role list change rarely. A failed load is not cached.
   */
  catalogue(): Observable<UserMappingCatalogueResponse> {
    if (!this.catalogue$) {
      this.catalogue$ = this.api
        .get<UserMappingCatalogueResponse | { data: UserMappingCatalogueResponse }>(`${BASE}/catalogue`)
        .pipe(
          map(unwrapData),
          map((wire) => ({
            roles: asList(wire?.roles),
            businessTypes: asList(wire?.businessTypes),
            regions: asList(wire?.regions).map((region) => ({ ...region, areas: asList(region.areas) })),
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

  /** Every account, with its role and how much it holds. */
  users(): Observable<UserMappingUserResponse[]> {
    return this.api
      .get<UserMappingUserResponse[] | { data: UserMappingUserResponse[] }>(`${BASE}/users`, { status: 'All' })
      .pipe(map(unwrapData), map((rows) => asList(rows)));
  }

  mapping(userId: string): Observable<UserMappingResponse> {
    return this.api
      .get<UserMappingResponse | { data: UserMappingResponse }>(userPath(userId))
      .pipe(map(unwrapData), map(normaliseMapping));
  }

  /** Sets the mapping to exactly this. Every list must be non-empty. */
  replace(userId: string, request: UserMappingWriteRequest): Observable<UserMappingWriteResponse> {
    return this.api.put<UserMappingWriteResponse>(userPath(userId), request).pipe(map(normaliseWrite));
  }

  /** Only if the user still holds `roleId` — otherwise 404, never whatever role they hold by now. */
  removeRole(userId: string, roleId: number): Observable<UserMappingWriteResponse> {
    return this.api.delete<UserMappingWriteResponse>(`${userPath(userId)}/role/${roleId}`).pipe(map(normaliseWrite));
  }

  removeBusinessType(userId: string, businessTypeId: number): Observable<UserMappingWriteResponse> {
    return this.api
      .delete<UserMappingWriteResponse>(`${userPath(userId)}/business-types/${businessTypeId}`)
      .pipe(map(normaliseWrite));
  }

  /** Removes the region and every area beneath it. */
  removeRegion(userId: string, regionCode: string): Observable<UserMappingWriteResponse> {
    return this.api
      .delete<UserMappingWriteResponse>(`${userPath(userId)}/regions`, { regionCode })
      .pipe(map(normaliseWrite));
  }

  removeArea(userId: string, areaCode: string): Observable<UserMappingWriteResponse> {
    return this.api
      .delete<UserMappingWriteResponse>(`${userPath(userId)}/areas`, { areaCode })
      .pipe(map(normaliseWrite));
  }

  /** How many accounts hold each role, per region. */
  regionRoles(filter: UserMappingRegionRoleFilter): Observable<UserMappingRegionRolesResponse> {
    return this.api
      .get<UserMappingRegionRolesResponse | { data: UserMappingRegionRolesResponse }>(
        `${BASE}/region-roles`,
        filter as Query,
      )
      .pipe(
        map(unwrapData),
        map((wire) => ({
          ...wire,
          roleTotals: asList(wire?.roleTotals),
          regions: asList(wire?.regions).map((region) => ({ ...region, roles: asList(region.roles) })),
        })),
      );
  }

  /** The accounts behind a count. Takes the same filters, plus sort and a 1-based page. */
  regionRoleUsers(
    filter: UserMappingRegionRoleFilter,
    options: { sort?: UserMappingRegionRoleSort; desc?: boolean; page?: number; pageSize?: number } = {},
  ): Observable<UserMappingRegionRolePageResponse> {
    return this.api
      .get<UserMappingRegionRolePageResponse>(`${BASE}/region-roles/users`, { ...filter, ...options } as Query)
      .pipe(map((page) => ({ ...page, items: asList(page?.items) })));
  }
}
