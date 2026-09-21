import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';

import { LevelOfAuthorityResponse } from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';
import { Admin2LevelOfAuthoritiesApi } from './admin2-level-of-authorities.api';
import { KeyedCollectionStore } from './keyed-collection.store';

/**
 * Every level of authority — 63 rows today, seven roles for each of nine business type and
 * claim nature pairs. Loaded whole; the screen groups it by pair in memory. See
 * KeyedCollectionStore.
 */
@Injectable({ providedIn: 'root' })
export class LevelOfAuthoritiesStore extends KeyedCollectionStore<LevelOfAuthorityResponse, number> {
  private readonly api = inject(Admin2LevelOfAuthoritiesApi);

  /**
   * The business type and claim nature last looked at. Kept here rather than in the screen,
   * so leaving and coming back lands on the same pair.
   */
  readonly selectedPair = signal<{ businessTypeId: number; claimNatureId: number } | null>(null);

  protected fetch(): Observable<LevelOfAuthorityResponse[]> {
    return this.api.list();
  }

  protected keyOf(row: LevelOfAuthorityResponse): number {
    return int(row.levelOfAuthorityId);
  }

  protected compare(a: LevelOfAuthorityResponse, b: LevelOfAuthorityResponse): number {
    return int(a.levelOfAuthorityId) - int(b.levelOfAuthorityId);
  }
}
