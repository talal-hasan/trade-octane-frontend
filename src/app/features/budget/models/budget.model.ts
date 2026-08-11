// A budget line as it appears in the Budget list (CLAUDE.md §7 analysis mode). Status
// values intentionally match StatusPillStatus so the list can bind them straight to
// to-status-pill without a mapping layer.
export type BudgetStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'overdue';

export interface BudgetRecord {
  id: string; // e.g. BUD-2026-001
  year: number;
  region: string;
  businessUnit: string;
  brand: string;
  masterSku: string;
  amount: number; // PKR, integer
  status: BudgetStatus;
}
