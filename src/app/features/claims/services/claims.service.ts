import { Observable } from 'rxjs';

import { ClaimRecord } from '../models/claim.model';

// Abstract class doubles as the DI token (CLAUDE.md §3 mock-first). Real implementation
// will be HttpClient-backed; components are unaffected by the swap.
export abstract class ClaimsService {
  abstract getClaims(): Observable<ClaimRecord[]>;
}
