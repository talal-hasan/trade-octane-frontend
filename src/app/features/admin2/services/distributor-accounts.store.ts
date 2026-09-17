import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { DistributorAccountResponse } from '../../../core/api/admin2.models';
import { Admin2DistributorsApi } from './admin2-distributors.api';
import { KeyedCollectionStore } from './keyed-collection.store';

/**
 * Every distributor account — about 520, returned whole with no cursor. Loaded with
 * `status=All` so the grid's status tabs, search, sort and paging run in memory. See
 * KeyedCollectionStore.
 */
@Injectable({ providedIn: 'root' })
export class DistributorAccountsStore extends KeyedCollectionStore<DistributorAccountResponse, string> {
  private readonly api = inject(Admin2DistributorsApi);

  protected fetch(): Observable<DistributorAccountResponse[]> {
    return this.api.list('All');
  }

  protected keyOf(row: DistributorAccountResponse): string {
    return row.distributorId;
  }

  protected compare(a: DistributorAccountResponse, b: DistributorAccountResponse): number {
    return a.distributorId.localeCompare(b.distributorId);
  }
}
