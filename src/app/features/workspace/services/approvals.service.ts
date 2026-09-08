import { Observable } from 'rxjs';

import { ApprovalDecision, ApprovalInboxItem } from '../models/approval-item.model';

// Abstract class doubles as the DI token (CLAUDE.md §3 mock-first): components inject
// ApprovalsService and receive MockApprovalsService today, the real HTTP-backed service
// later, with zero component changes. Methods return Observables because the real
// implementation will be HttpClient-backed.
export abstract class ApprovalsService {
  abstract getInbox(): Observable<ApprovalInboxItem[]>;
  abstract decide(itemId: string, decision: ApprovalDecision, remarks: string): Observable<void>;
}
