import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import {
  DistributorAccessCatalogueResponse,
  DistributorAccessResponse,
  DistributorAccessWriteResponse,
  DistributorMenuResponse,
  ReplaceDistributorAccessRequest,
} from '../../../core/api/admin2.models';
import { asList, unwrapData } from '../../../core/api/api.types';

const BASE = '/admin2/distributor-access';

/**
 * Forces the nested menu tree to real arrays at the boundary — the scalar-vs-collection
 * drift `asList` exists for. A parent with one child must not arrive as a bare object and
 * blank that whole branch of the tree.
 */
function normaliseMenus(nodes: readonly DistributorMenuResponse[] | undefined): DistributorMenuResponse[] {
  return asList(nodes).map((node) => ({ ...node, children: normaliseMenus(node.children) }));
}

function normaliseAccess(wire: DistributorAccessResponse): DistributorAccessResponse {
  const tree = (nodes: DistributorAccessResponse['tree'] | undefined): DistributorAccessResponse['tree'] =>
    asList(nodes).map((node) => ({ ...node, children: tree(node.children) }));

  return {
    ...wire,
    tree: tree(wire?.tree),
    menuIds: asList(wire?.menuIds),
    orphanedMenuIds: asList(wire?.orphanedMenuIds),
  };
}

/** `Administration 2.0 / Distributor Access` — replaces `CPS_Access_Control.aspx`. */
@Injectable({ providedIn: 'root' })
export class Admin2DistributorAccessApi {
  private readonly api = inject(ApiClient);

  /**
   * The distributors and the menu tree, in one call.
   *
   * `includeInactive` is passed explicitly: the legacy picker offered active distributors
   * only, while 132 inactive ones still hold grants — this screen loads everything and
   * filters in memory, so an inactive holder can be found and revoked.
   */
  catalogue(includeInactive = true): Observable<DistributorAccessCatalogueResponse> {
    return this.api
      .get<DistributorAccessCatalogueResponse | { data: DistributorAccessCatalogueResponse }>(
        `${BASE}/catalogue`,
        { includeInactive },
      )
      .pipe(
        map(unwrapData),
        map((wire) => ({
          distributors: asList(wire?.distributors),
          menus: normaliseMenus(wire?.menus),
        })),
      );
  }

  /**
   * One distributor's grants, as a checked tree. No legacy counterpart: the code that
   * checked the tree was commented out, so the screen never showed what was held.
   */
  get(distributorId: string): Observable<DistributorAccessResponse> {
    return this.api
      .get<DistributorAccessResponse | { data: DistributorAccessResponse }>(
        `${BASE}/distributors/${encodeURIComponent(distributorId)}`,
      )
      .pipe(map(unwrapData), map(normaliseAccess));
  }

  /**
   * The Update Information button: every named distributor ends up holding exactly
   * `menuIds`, in one transaction, with an audit row per grant actually added or removed.
   *
   * `allowOrphanedGrants` keeps a child whose parent is not granted. The editor cascades
   * so it can never create one, and passes this only to preserve orphans that were
   * already stored — otherwise the save of an untouched distributor would be refused.
   */
  replace(
    request: ReplaceDistributorAccessRequest,
    allowOrphanedGrants = false,
  ): Observable<DistributorAccessWriteResponse> {
    return this.api.put<DistributorAccessWriteResponse>(
      `${BASE}/menus`,
      request,
      allowOrphanedGrants ? { allowOrphanedGrants: true } : undefined,
    );
  }
}
