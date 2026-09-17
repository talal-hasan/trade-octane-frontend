import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { Octane2RoleResponse } from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';
import { Admin2RolesApi } from './admin2-roles.api';
import { KeyedCollectionStore } from './keyed-collection.store';

/**
 * Every Administration 2.0 role — 33 today. Loaded with `status=All`: the list's status
 * tabs run in memory, and the form checks a new name against every role, inactive ones
 * included, as the server does. See KeyedCollectionStore.
 */
@Injectable({ providedIn: 'root' })
export class Octane2RolesStore extends KeyedCollectionStore<Octane2RoleResponse, number> {
  private readonly api = inject(Admin2RolesApi);

  protected fetch(): Observable<Octane2RoleResponse[]> {
    return this.api.list('All');
  }

  protected keyOf(row: Octane2RoleResponse): number {
    return int(row.roleId);
  }

  protected compare(a: Octane2RoleResponse, b: Octane2RoleResponse): number {
    return int(a.roleId) - int(b.roleId);
  }
}
