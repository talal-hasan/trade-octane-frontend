import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import {
  BrandResponse,
  BrandStatusFilter,
  RegionResponse,
  RegionStatusFilter,
  UserBrandAssignmentResponse,
  UserBrandPageResponse,
  UserBrandSortField,
  UserBrandWriteResponse,
  UserRegionAssignmentResponse,
  UserRegionPageResponse,
  UserRegionSortField,
  UserRegionWriteResponse,
} from '../../../core/api/admin.models';

export interface UserRegionGridQuery {
  search?: string;
  userId?: string;
  regionCode?: string;
  grantingOnly?: boolean;
  sort?: UserRegionSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

export interface UserBrandGridQuery {
  search?: string;
  userId?: string;
  brandCode?: string;
  grantingOnly?: boolean;
  /** Grants whose brand no longer exists in the master list. */
  danglingOnly?: boolean;
  sort?: UserBrandSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

/**
 * `Administration 1.0 / User Region Mapping` + `/ User Brand Mapping`.
 *
 * Both catalogues come from a **different database** (`Centegy_SnDPro_DR`), so no foreign
 * key protects the mapping tables. Two rules follow, and both are enforced by never
 * transforming a code anywhere between here and the UI:
 *
 *   • Codes must be sent back exactly as reported. No trimming, no case folding.
 *   • A mapping can point at a code that no longer exists — hence `regionExists` /
 *     `brandExists` on the grid rows, and the `danglingOnly` filter for brands.
 */
@Injectable({ providedIn: 'root' })
export class AdminScopeApi {
  private readonly api = inject(ApiClient);

  // ─── Catalogues ─────────────────────────────────────────────────────────────

  /** Defaults to active regions only — 9 of the 16 are live. */
  listRegions(
    options: { status?: RegionStatusFilter; search?: string } = {},
  ): Observable<RegionResponse[]> {
    return this.api.get<RegionResponse[]>('/admin/regions', options as Query);
  }

  /**
   * Defaults to active brands only — 16 of the 22.
   *
   * This deliberately differs from legacy, which filtered on "has a master SKU" instead
   * and thereby silently excluded the one brand whose code disagrees with its own
   * PROD1~…~PROD6 concatenation. `hasMasterSku` is still reported per brand so the UI can
   * show the distinction rather than re-introduce the old filter.
   */
  listBrands(
    options: { status?: BrandStatusFilter; search?: string } = {},
  ): Observable<BrandResponse[]> {
    return this.api.get<BrandResponse[]>('/admin/brands', options as Query);
  }

  // ─── Per-user assignment ────────────────────────────────────────────────────

  userRegions(userId: string): Observable<UserRegionAssignmentResponse> {
    return this.api.get<UserRegionAssignmentResponse>(
      `/admin/users/${encodeURIComponent(userId)}/regions`,
    );
  }

  replaceUserRegions(
    userId: string,
    regionCodes: readonly string[],
    allowRetiredRegions = false,
  ): Observable<UserRegionWriteResponse> {
    return this.api.put<UserRegionWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/regions`,
      { regionCodes: [...regionCodes] },
      { allowRetiredRegions },
    );
  }

  addUserRegions(
    userId: string,
    regionCodes: readonly string[],
    allowRetiredRegions = false,
  ): Observable<UserRegionWriteResponse> {
    return this.api.post<UserRegionWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/regions`,
      { regionCodes: [...regionCodes] },
      { allowRetiredRegions },
    );
  }

  removeUserRegion(userId: string, regionCode: string): Observable<UserRegionWriteResponse> {
    return this.api.delete<UserRegionWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/regions`,
      { regionCode },
    );
  }

  userBrands(userId: string): Observable<UserBrandAssignmentResponse> {
    return this.api.get<UserBrandAssignmentResponse>(
      `/admin/users/${encodeURIComponent(userId)}/brands`,
    );
  }

  replaceUserBrands(
    userId: string,
    brandCodes: readonly string[],
    allowRetiredBrands = false,
  ): Observable<UserBrandWriteResponse> {
    return this.api.put<UserBrandWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/brands`,
      { brandCodes: [...brandCodes] },
      { allowRetiredBrands },
    );
  }

  addUserBrands(
    userId: string,
    brandCodes: readonly string[],
    allowRetiredBrands = false,
  ): Observable<UserBrandWriteResponse> {
    return this.api.post<UserBrandWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/brands`,
      { brandCodes: [...brandCodes] },
      { allowRetiredBrands },
    );
  }

  removeUserBrand(userId: string, brandCode: string): Observable<UserBrandWriteResponse> {
    return this.api.delete<UserBrandWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/brands`,
      { brandCode },
    );
  }

  // ─── Cross-user grids (feed the Access Explorer) ────────────────────────────

  listUserRegionGrants(query: UserRegionGridQuery = {}): Observable<UserRegionPageResponse> {
    return this.api.get<UserRegionPageResponse>('/admin/user-regions', query as Query);
  }

  exportUserRegionGrants(
    query: Omit<UserRegionGridQuery, 'pageSize' | 'cursor'> = {},
  ): Observable<Blob> {
    return this.api.downloadCsv('/admin/user-regions/export', query as Query);
  }

  listUserBrandGrants(query: UserBrandGridQuery = {}): Observable<UserBrandPageResponse> {
    return this.api.get<UserBrandPageResponse>('/admin/user-brands', query as Query);
  }

  exportUserBrandGrants(
    query: Omit<UserBrandGridQuery, 'pageSize' | 'cursor'> = {},
  ): Observable<Blob> {
    return this.api.downloadCsv('/admin/user-brands/export', query as Query);
  }
}
