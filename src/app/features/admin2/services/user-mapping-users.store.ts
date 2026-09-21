import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { UserMappingResponse, UserMappingUserResponse } from '../../../core/api/admin2.models';
import { Admin2UserMappingApi } from './admin2-user-mapping.api';
import { KeyedCollectionStore } from './keyed-collection.store';

/**
 * Every Promo_Management_2 account — 540 today — with its role and mapping counts. Loaded
 * whole; the picker searches and filters in memory. See KeyedCollectionStore.
 */
@Injectable({ providedIn: 'root' })
export class UserMappingUsersStore extends KeyedCollectionStore<UserMappingUserResponse, string> {
  private readonly api = inject(Admin2UserMappingApi);

  protected fetch(): Observable<UserMappingUserResponse[]> {
    return this.api.users();
  }

  protected keyOf(row: UserMappingUserResponse): string {
    return row.userId;
  }

  protected compare(a: UserMappingUserResponse, b: UserMappingUserResponse): number {
    return a.userId.localeCompare(b.userId);
  }

  /** Brings the picker's summary row in line with the mapping a write returned. */
  applyMapping(mapping: UserMappingResponse): void {
    this.upsert({
      userId: mapping.userId,
      fullName: mapping.fullName,
      email: mapping.email,
      isActive: mapping.userIsActive,
      roleId: mapping.role?.roleId ?? null,
      roleName: mapping.role?.roleName ?? null,
      businessTypeCount: mapping.businessTypes.length,
      regionCount: mapping.regions.length,
      areaCount: mapping.areas.length,
    });
  }
}
