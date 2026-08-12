import { Signal } from '@angular/core';
import { Observable } from 'rxjs';

import { ClaimRecord, NewClaimInput } from '../models/claim.model';

// Stateful claims store (CLAUDE.md §3 mock-first). `claims` is the single reactive source
// of truth shared by the list, the detail screen and the approvals inbox — mutations
// (create, and later approve/reject) update it so every consumer reacts. The abstract class
// doubles as the DI token; the real HttpClient-backed implementation swaps in with no
// component changes.
export abstract class ClaimsService {
  /** Reactive source of truth for all claims. */
  abstract readonly claims: Signal<readonly ClaimRecord[]>;

  /** Simulates an initial fetch so consumers can show a loading state. */
  abstract refresh(): Observable<readonly ClaimRecord[]>;

  /** Creates a claim (Stage VBase, Status Pending) and prepends it to the store. */
  abstract create(input: NewClaimInput): Observable<ClaimRecord>;
}
