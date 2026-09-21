import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  Octane2RoleResponse,
  Octane2RoleStatusFilter,
  Octane2RoleWriteRequest,
  Octane2RoleWriteResponse,
} from '../../../core/api/admin2.models';

const BASE = '/admin2/roles';

/**
 * `Administration 2.0 / Create Role` — replaces `CPS_Role.aspx`. Not the 1.0 role catalogue
 * (`AdminRolesApi`): a different table, with claim flags and no menu seeding.
 *
 * There is no delete, deliberately. Legacy hid the button, and most tables that reference a
 * role id have no foreign key to stop a delete orphaning them.
 */
@Injectable({ providedIn: 'root' })
export class Admin2RolesApi {
  private readonly api = inject(ApiClient);

  list(status: Octane2RoleStatusFilter = 'Active'): Observable<Octane2RoleResponse[]> {
    return this.api
      .get<Octane2RoleResponse[] | { data: Octane2RoleResponse[] }>(BASE, { status })
      .pipe(map(unwrapData), map((rows) => asList(rows)));
  }

  get(roleId: number): Observable<Octane2RoleResponse> {
    return this.api
      .get<Octane2RoleResponse | { data: Octane2RoleResponse }>(`${BASE}/${roleId}`)
      .pipe(map(unwrapData));
  }

  /** Created active, with no menu grants. The name must be unique ignoring case. */
  create(request: Octane2RoleWriteRequest): Observable<Octane2RoleResponse> {
    return this.api
      .post<Octane2RoleResponse | { data: Octane2RoleResponse }>(BASE, request)
      .pipe(map(unwrapData));
  }

  /** Replaces every field. An unchanged re-save writes nothing: `changedFields` is empty. */
  update(roleId: number, request: Octane2RoleWriteRequest): Observable<Octane2RoleWriteResponse> {
    return this.api.put<Octane2RoleWriteResponse>(`${BASE}/${roleId}`, request);
  }

  activate(roleId: number): Observable<Octane2RoleWriteResponse> {
    return this.api.post<Octane2RoleWriteResponse>(`${BASE}/${roleId}/activate`);
  }

  /** Revokes nothing — see `Octane2RoleResponse.isActive`. */
  deactivate(roleId: number): Observable<Octane2RoleWriteResponse> {
    return this.api.post<Octane2RoleWriteResponse>(`${BASE}/${roleId}/deactivate`);
  }
}
