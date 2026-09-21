import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import {
  DistributorAccessDistributorResponse,
  DistributorMenuResponse,
} from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';
import { Admin2DistributorAccessApi } from './admin2-distributor-access.api';
import { KeyedCollectionStore } from './keyed-collection.store';

/**
 * The Distributor Access catalogue: every distributor with its grant count, and the
 * distributor portal's 23-item menu tree — one call, held for the session.
 *
 * It extends KeyedCollectionStore for the distributors, because they are the collection
 * the grid filters, sorts and pages in memory. The menu tree arrives in the same response
 * and is stashed on the way past, rather than fetched again by a second store: the two are
 * always read together and the server builds them from one command.
 */
@Injectable({ providedIn: 'root' })
export class DistributorAccessCatalogueStore extends KeyedCollectionStore<
  DistributorAccessDistributorResponse,
  string
> {
  private readonly api = inject(Admin2DistributorAccessApi);
  private readonly menusState = signal<readonly DistributorMenuResponse[]>([]);

  /** The menu tree, in sidebar order. Empty until the first load succeeds. */
  readonly menus = this.menusState.asReadonly();

  /** Every menu id in the catalogue — what a grant has to name to mean anything. */
  readonly menuIds = computed<ReadonlySet<number>>(() => {
    const ids = new Set<number>();
    const walk = (nodes: readonly DistributorMenuResponse[]): void => {
      for (const node of nodes) {
        ids.add(int(node.menuId));
        walk(node.children);
      }
    };
    walk(this.menusState());
    return ids;
  });

  protected fetch(): Observable<DistributorAccessDistributorResponse[]> {
    return this.api.catalogue(true).pipe(
      tap((catalogue) => this.menusState.set(catalogue.menus)),
      // The base store owns the distributors; the menus have already been taken off above.
      map((catalogue) => catalogue.distributors),
    );
  }

  protected keyOf(row: DistributorAccessDistributorResponse): string {
    return row.distributorId;
  }

  protected compare(
    a: DistributorAccessDistributorResponse,
    b: DistributorAccessDistributorResponse,
  ): number {
    return a.distributorId.localeCompare(b.distributorId);
  }

  /**
   * Patches a grant count after a save, instead of re-fetching the catalogue. The write
   * replaced the distributor's set, so the new count is exactly the set's size.
   */
  setGrantCount(distributorId: string, grantedMenuCount: number): void {
    const row = this.byKey(distributorId);
    if (row) {
      this.upsert({ ...row, grantedMenuCount });
    }
  }
}
