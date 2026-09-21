import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { asList, unwrapData } from '../../../core/api/api.types';
import {
  ApprovalHierarchyCatalogueResponse,
  ApprovalHierarchyResponse,
  ApprovalHierarchyWriteResponse,
  ReplaceApprovalHierarchyRequest,
} from '../../../core/api/admin.models';

const BASE = '/admin/approval-hierarchies';

/** The three keys one hierarchy is stored under. */
export interface ApprovalHierarchyScope {
  businessTypeId: number;
  groupId: string;
  schemeId: string;
}

function scopeQuery(scope: ApprovalHierarchyScope): Record<string, string> {
  return {
    businessTypeId: String(scope.businessTypeId),
    groupId: scope.groupId,
    schemeId: scope.schemeId,
  };
}

function normalise(wire: ApprovalHierarchyResponse): ApprovalHierarchyResponse {
  return { ...wire, levels: asList(wire?.levels) };
}

/**
 * `Administration 1.0 / Approval Hierarchy` — replaces `Hierarchy.aspx`. The budget, scheme
 * and activity approval code reads these rows at every step, so a save reaches documents
 * already in approval.
 */
@Injectable({ providedIn: 'root' })
export class AdminApprovalHierarchiesApi {
  private readonly api = inject(ApiClient);

  private catalogue$: Observable<ApprovalHierarchyCatalogueResponse> | null = null;

  /** Business types, groups, scheme keys and roles, cached for the session. A failed load is not cached. */
  catalogue(): Observable<ApprovalHierarchyCatalogueResponse> {
    if (!this.catalogue$) {
      this.catalogue$ = this.api
        .get<ApprovalHierarchyCatalogueResponse | { data: ApprovalHierarchyCatalogueResponse }>(`${BASE}/catalogue`)
        .pipe(
          map(unwrapData),
          map((wire) => ({
            businessTypes: asList(wire?.businessTypes),
            groups: asList(wire?.groups),
            schemes: asList(wire?.schemes),
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

  get(scope: ApprovalHierarchyScope): Observable<ApprovalHierarchyResponse> {
    return this.api
      .get<ApprovalHierarchyResponse | { data: ApprovalHierarchyResponse }>(BASE, scopeQuery(scope))
      .pipe(map(unwrapData), map(normalise));
  }

  /** Replaces every step in one transaction; applies to documents already in approval. */
  replace(scope: ApprovalHierarchyScope, request: ReplaceApprovalHierarchyRequest): Observable<ApprovalHierarchyWriteResponse> {
    return this.api
      .put<ApprovalHierarchyWriteResponse>(BASE, request, scopeQuery(scope))
      .pipe(map((response) => ({ ...response, hierarchy: normalise(response.hierarchy) })));
  }
}
