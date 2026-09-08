import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { unwrapData } from '../../../core/api/api.types';
import {
  AccessSortField,
  AccessStatusFilter,
  AccessTreeScope,
  RoleAccessResponse,
  RoleAccessWriteResponse,
  RoleMenuGrantPageResponse,
  UserAccessResponse,
  UserAccessWriteResponse,
  UserMenuGrantPageResponse,
} from '../../../core/api/admin.models';

export interface UserMenuGrantQuery {
  search?: string;
  userId?: string;
  menuId?: number;
  /** Grants pointing at a menu row that no longer exists. */
  orphanedOnly?: boolean;
  /** Grants that cannot authorise anything — the menu is inactive or the user is not. */
  deadOnly?: boolean;
  status?: AccessStatusFilter;
  sort?: AccessSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

export interface RoleMenuGrantQuery extends Omit<UserMenuGrantQuery, 'userId'> {
  roleId?: number;
}

/**
 * `Administration 1.0 / Access Control` + `/ Access Control By Role`.
 *
 * The user-side endpoints replace legacy's `trv_Menu`, which could not distinguish the
 * three things `UserAccessResponse` now reports separately — direct grants, role-derived
 * grants, and the effective union. Read the note on `UserAccessResponse` before wiring a
 * checkbox to any of them; binding to the wrong set produces a tree that appears not to
 * save.
 */
@Injectable({ providedIn: 'root' })
export class AdminAccessApi {
  private readonly api = inject(ApiClient);

  // ─── One user's access ──────────────────────────────────────────────────────

  userAccess(
    userId: string,
    options: { scope?: AccessTreeScope; status?: AccessStatusFilter } = {},
  ): Observable<UserAccessResponse> {
    return this.api
      .get<UserAccessResponse | { data: UserAccessResponse }>(
        `/admin/users/${encodeURIComponent(userId)}/access`,
        options as Query,
      )
      .pipe(map(unwrapData));
  }

  /**
   * Sets a user's **direct** grants to exactly this set.
   *
   * Role-derived access is untouched — the contract is explicit that PUT here "cannot
   * remove" `roleMenuIds`. Sending `directMenuIds` back unchanged is a guaranteed no-op,
   * which is what makes an optimistic save safe to retry.
   */
  replaceUserAccess(
    userId: string,
    menuIds: readonly number[],
    options: { allowInactiveMenus?: boolean; allowOrphanedGrants?: boolean } = {},
  ): Observable<UserAccessWriteResponse> {
    return this.api.put<UserAccessWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/access`,
      { menuIds: [...menuIds] },
      options as Query,
    );
  }

  addUserAccess(
    userId: string,
    menuIds: readonly number[],
    options: { allowInactiveMenus?: boolean; allowOrphanedGrants?: boolean } = {},
  ): Observable<UserAccessWriteResponse> {
    return this.api.post<UserAccessWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/access`,
      { menuIds: [...menuIds] },
      options as Query,
    );
  }

  removeUserAccess(userId: string, menuId: number): Observable<UserAccessWriteResponse> {
    return this.api.delete<UserAccessWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/access`,
      { menuId },
    );
  }

  // ─── One role's access ──────────────────────────────────────────────────────

  roleAccess(
    roleId: number,
    options: { scope?: AccessTreeScope; status?: AccessStatusFilter } = {},
  ): Observable<RoleAccessResponse> {
    return this.api
      .get<RoleAccessResponse | { data: RoleAccessResponse }>(
        `/admin/roles/${roleId}/access`,
        options as Query,
      )
      .pipe(map(unwrapData));
  }

  /**
   * Editing a role's access changes access for everyone holding it — the response reports
   * `affectedUserCount` and `affectedUserIds` precisely so the UI can say so. Confirm the
   * blast radius before calling this; do not save a role tree silently.
   */
  replaceRoleAccess(
    roleId: number,
    menuIds: readonly number[],
    options: {
      allowRetiredRole?: boolean;
      allowInactiveMenus?: boolean;
      allowOrphanedGrants?: boolean;
    } = {},
  ): Observable<RoleAccessWriteResponse> {
    return this.api.put<RoleAccessWriteResponse>(
      `/admin/roles/${roleId}/access`,
      { menuIds: [...menuIds] },
      options as Query,
    );
  }

  addRoleAccess(
    roleId: number,
    menuIds: readonly number[],
    options: {
      allowRetiredRole?: boolean;
      allowInactiveMenus?: boolean;
      allowOrphanedGrants?: boolean;
    } = {},
  ): Observable<RoleAccessWriteResponse> {
    return this.api.post<RoleAccessWriteResponse>(
      `/admin/roles/${roleId}/access`,
      { menuIds: [...menuIds] },
      options as Query,
    );
  }

  removeRoleAccess(roleId: number, menuId: number): Observable<RoleAccessWriteResponse> {
    return this.api.delete<RoleAccessWriteResponse>(`/admin/roles/${roleId}/access`, { menuId });
  }

  // ─── Cross-cutting grant grids (feed the Access Explorer) ───────────────────

  listUserMenuGrants(query: UserMenuGrantQuery = {}): Observable<UserMenuGrantPageResponse> {
    return this.api.get<UserMenuGrantPageResponse>('/admin/user-menus', query as Query);
  }

  exportUserMenuGrants(
    query: Omit<UserMenuGrantQuery, 'pageSize' | 'cursor'> = {},
  ): Observable<Blob> {
    return this.api.downloadCsv('/admin/user-menus/export', query as Query);
  }

  listRoleMenuGrants(query: RoleMenuGrantQuery = {}): Observable<RoleMenuGrantPageResponse> {
    return this.api.get<RoleMenuGrantPageResponse>('/admin/role-menus', query as Query);
  }

  exportRoleMenuGrants(
    query: Omit<RoleMenuGrantQuery, 'pageSize' | 'cursor'> = {},
  ): Observable<Blob> {
    return this.api.downloadCsv('/admin/role-menus/export', query as Query);
  }
}
