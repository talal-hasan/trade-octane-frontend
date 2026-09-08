import { Injectable, inject } from '@angular/core';
import { Observable, concat, defer, last, map, of, switchMap } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { int } from '../../../core/api/api.types';
import {
  RoleResponse,
  RoleStatusFilter,
  UserRoleAssignmentResponse,
  UserRolePageResponse,
  UserRoleSortField,
  UserRoleWriteResponse,
} from '../../../core/api/admin.models';

export interface UserRoleGridQuery {
  search?: string;
  userId?: string;
  roleId?: number;
  activeOnly?: boolean;
  sort?: UserRoleSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

/** `Administration 1.0 / Assign Role To User`. */
@Injectable({ providedIn: 'root' })
export class AdminRolesApi {
  private readonly api = inject(ApiClient);

  /** The assignable role catalogue. Defaults to active roles only, server-side. */
  listRoles(options: { status?: RoleStatusFilter; search?: string } = {}): Observable<RoleResponse[]> {
    return this.api.get<RoleResponse[]>('/admin/roles', options as Query);
  }

  /** The roles one user holds, and the roles they could hold. */
  userRoles(userId: string): Observable<UserRoleAssignmentResponse> {
    return this.api.get<UserRoleAssignmentResponse>(
      `/admin/users/${encodeURIComponent(userId)}/roles`,
    );
  }

  assignRole(
    userId: string,
    roleId: number,
    allowInactiveRoles = false,
  ): Observable<UserRoleWriteResponse> {
    return this.api.post<UserRoleWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/roles`,
      { roleId },
      { allowInactiveRoles },
    );
  }

  removeRole(userId: string, roleId: number): Observable<UserRoleWriteResponse> {
    return this.api.delete<UserRoleWriteResponse>(
      `/admin/users/${encodeURIComponent(userId)}/roles/${roleId}`,
    );
  }

  /**
   * Sets a user's roles to exactly `roleIds`.
   *
   * ── Why this is not one PUT ──────────────────────────────────────────────────
   * `PUT /admin/users/{userId}/roles` is documented as "Set a user's roles to exactly this
   * set" and its response reports `added[]` / `removed[]` / `unchanged[]` — but its request
   * body, `UserRoleWriteRequest`, carries a **single scalar `roleId`**. A scalar cannot
   * express a set. Every sibling write takes an array (`regionCodes`, `brandCodes`,
   * `menuIds`), so this is near-certainly a contract slip rather than a design.
   *
   * Rather than block the Roles tab on a backend fix, this composes the same outcome from
   * the primitives that do work: DELETE what is no longer wanted, POST what is new, leave
   * the rest alone. The observable completes with the final assignment state, so callers
   * see one result exactly as they would from a real PUT.
   *
   * **When the contract grows `roleIds`, delete this method's body and call the PUT.**
   * Nothing else in the app needs to change.
   */
  replaceUserRoles(
    userId: string,
    roleIds: readonly number[],
    allowInactiveRoles = false,
  ): Observable<UserRoleAssignmentResponse> {
    return defer(() => this.userRoles(userId)).pipe(
      switchMap((current) => {
        const desired = new Set(roleIds);
        const held = new Set(current.assigned.map((role) => int(role.roleId)));

        const toRemove = [...held].filter((roleId) => !desired.has(roleId));
        const toAdd = [...desired].filter((roleId) => !held.has(roleId));

        if (toRemove.length === 0 && toAdd.length === 0) {
          return of(current);
        }

        // Removals first: a role catalogue can cap how many roles one user may hold, and
        // freeing the slots before filling them avoids tripping that on a swap.
        const writes = [
          ...toRemove.map((roleId) => this.removeRole(userId, roleId)),
          ...toAdd.map((roleId) => this.assignRole(userId, roleId, allowInactiveRoles)),
        ];

        return concat(...writes).pipe(
          last(),
          map((response) => response.assignment),
        );
      }),
    );
  }

  // ─── The cross-user mapping grid (feeds the Access Explorer) ────────────────

  listUserRoleGrants(query: UserRoleGridQuery = {}): Observable<UserRolePageResponse> {
    return this.api.get<UserRolePageResponse>('/admin/user-roles', query as Query);
  }

  exportUserRoleGrants(query: Omit<UserRoleGridQuery, 'pageSize' | 'cursor'> = {}): Observable<Blob> {
    return this.api.downloadCsv('/admin/user-roles/export', query as Query);
  }
}
