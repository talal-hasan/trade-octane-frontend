import { Observable } from 'rxjs';

import { BudgetRecord } from '../models/budget.model';

// Abstract class doubles as the DI token (CLAUDE.md §3 mock-first). Returns an Observable
// because the real implementation will be HttpClient-backed; components stay identical
// across the mock/real swap.
export abstract class BudgetService {
  abstract getBudgets(): Observable<BudgetRecord[]>;
}
