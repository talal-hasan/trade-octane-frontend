import { Observable } from 'rxjs';

import { AttentionItem, DashboardCharts } from '../models/dashboard.model';

// Supplies the aggregate figures the Dashboard cannot derive from the existing feature
// stores — volume in litres, budget consumption per region, scheme mix, approval ageing.
// Pending *counts* are NOT sourced here: those come straight from the live claims and
// schemes stores so the Dashboard and the workspaces can never disagree.
//
// Aggregates are scoped server-side in the real implementation, so the contract takes the
// caller's regions and brands. The mock filters client-side to prove the scoping is real
// on the POC (KT: "Reports & Dashboard — role-specific, users see only their
// hierarchy/region"). Abstract class doubles as the DI token (CLAUDE.md §3).
export abstract class DashboardService {
  abstract getCharts(regions: readonly string[], brands: readonly string[]): Observable<DashboardCharts>;

  abstract getAttention(regions: readonly string[]): Observable<AttentionItem[]>;
}
