import { Injectable, inject } from '@angular/core';
import { Observable, concat, defer, last, map, of, switchMap } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { asList, int, unwrapData } from '../../../core/api/api.types';
import {
  RoleResponse,
  RoleStatusFilter,
  UserRoleAssignmentResponse,
  UserRoleAssignmentWire,
  UserRolePageResponse,
  UserRoleSortField,
  UserRoleWriteResponse,
  UserRoleWriteWire,
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

/**
 * Forces the assignment's two collections to be real arrays.
 *
 * One call site per endpoint, at the boundary, so every component downstream can trust the
 * declared type. Delete this and its `UserRoleAssignmentWire` type together once the
 * backend serialises a single role as a one-element array.
 */
function normaliseAssignment(wire: UserRoleAssignmentWire): UserRoleAssignmentResponse {
  return {
    ...wire,
    assigned: asList(wire?.assigned),
    available: asList(wire?.available),
  };
}

/** The write responses embed the same assignment, so they need the same treatment. */
function normaliseWrite(wire: UserRoleWriteWire): UserRoleWriteResponse {
  return { ...wire, assignment: normaliseAssignment(wire?.assignment) };
}

/** `Administration 1.0 / Assign Role To User`. */
@Injectable({ providedIn: 'root' })
export class AdminRolesApi {
  private readonly api = inject(ApiClient);

  /** The assignable role catalogue. Defaults to active roles only, server-side. */
  listRoles(options: { status?: RoleStatusFilter; search?: string } = {}): Observable<RoleResponse[]> {
    return this.api
      .get<RoleResponse[] | { data: RoleResponse[] }>('/admin/roles', options as Query)
      .pipe(map(unwrapData));
  }

  /**
   * The roles one user holds, and the roles they could hold.
   *
   * Both lists are normalised through `asList` because the server sends `assigned` as a
   * bare object when the user holds exactly one role. Without this, `assigned.map(...)`
   * throws inside the subscriber, the Roles tab aborts mid-render and shows nothing —
   * which is precisely what it did. See `UserRoleAssignmentWire`.
   */
  userRoles(userId: string): Observable<UserRoleAssignmentResponse> {
    return this.api
      .get<UserRoleAssignmentWire | { data: UserRoleAssignmentWire }>(
        `/admin/users/${encodeURIComponent(userId)}/roles`,
      )
      .pipe(map(unwrapData), map(normaliseAssignment));
  }

  assignRole(
    userId: string,
    roleId: number,
    allowInactiveRoles = false,
  ): Observable<UserRoleWriteResponse> {
    return this.api
      .post<UserRoleWriteWire>(
        `/admin/users/${encodeURIComponent(userId)}/roles`,
        { roleId },
        { allowInactiveRoles },
      )
      .pipe(map(normaliseWrite));
  }

  removeRole(userId: string, roleId: number): Observable<UserRoleWriteResponse> {
    return this.api
      .delete<UserRoleWriteWire>(
        `/admin/users/${encodeURIComponent(userId)}/roles/${roleId}`,
      )
      .pipe(map(normaliseWrite));
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
