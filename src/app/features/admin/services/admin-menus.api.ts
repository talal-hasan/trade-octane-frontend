import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { unwrapData } from '../../../core/api/api.types';
import {
  MenuActivation,
  MenuOctane,
  MenuPageResponse,
  MenuResponse,
  MenuSortField,
  MenuStatusFilter,
  MenuTreeResponse,
  MenuWriteRequest,
  MenuWriteResponse,
} from '../../../core/api/admin.models';

export interface MenuGridQuery {
  search?: string;
  octane?: MenuOctane;
  parentId?: number;
  rootsOnly?: boolean;
  status?: MenuStatusFilter;
  sort?: MenuSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

/**
 * `Administration 1.0 / Add Menu`.
 *
 * This screen has **no legacy menu row** — it is fully specified in the contract (8
 * endpoints) but appears nowhere in `/identity/menu`, so it cannot be gated on a grant.
 * It is gated on `UserResponse.isAdmin` instead; see ADMIN_ONLY_ROUTES in menu-blueprint.
 *
 * It is also the screen that governs the blueprint's own input, which makes it worth
 * building early: `menuPage` here is the field that would let us verify menu ids against
 * legacy page names across environments.
 */
@Injectable({ providedIn: 'root' })
export class AdminMenusApi {
  private readonly api = inject(ApiClient);

  list(query: MenuGridQuery = {}): Observable<MenuPageResponse> {
    return this.api.get<MenuPageResponse>('/admin/menus', query as Query);
  }

  exportCsv(query: Omit<MenuGridQuery, 'pageSize' | 'cursor'> = {}): Observable<Blob> {
    return this.api.downloadCsv('/admin/menus/export', query as Query);
  }

  /** One application's menu as the two-level tree it renders as. */
  tree(
    options: { octane?: MenuOctane; status?: MenuStatusFilter } = {},
  ): Observable<MenuTreeResponse> {
    return this.api
      .get<MenuTreeResponse | { data: MenuTreeResponse }>('/admin/menus/tree', options as Query)
      .pipe(map(unwrapData));
  }

  /** The icon names the menu can render — FontAwesome 4, mapped to Tabler on display. */
  icons(): Observable<string[]> {
    return this.api
      .get<string[] | { data: string[] }>('/admin/menus/icons')
      .pipe(map(unwrapData));
  }

  get(menuId: number): Observable<MenuResponse> {
    return this.api
      .get<MenuResponse | { data: MenuResponse }>(`/admin/menus/${menuId}`)
      .pipe(map(unwrapData));
  }

  /**
   * `POST /admin/menus` declares no response body in the contract, so the caller re-reads
   * the grid. `MenuWriteResponse.requiresAccessGrant` — the flag that says "nobody can see
   * this yet" — is therefore only available on update, which is a shame for the create
   * flow. [QUESTION for Zeeshan] Can POST return MenuWriteResponse like PUT does?
   */
  create(request: MenuWriteRequest): Observable<void> {
    return this.api.post<void>('/admin/menus', request);
  }

  update(menuId: number, request: MenuWriteRequest): Observable<MenuWriteResponse> {
    return this.api.put<MenuWriteResponse>(`/admin/menus/${menuId}`, request);
  }

  /** Show or hide a menu item. Separate from update so a toggle is not a full-record write. */
  setActivation(menuId: number, activation: MenuActivation): Observable<MenuWriteResponse> {
    return this.api.put<MenuWriteResponse>(`/admin/menus/${menuId}/activation`, { activation });
  }
}
