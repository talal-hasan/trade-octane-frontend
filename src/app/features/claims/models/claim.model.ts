// A claim row for the Claims list (CLAUDE.md §8 Claims). Three claim types and a
// three-stage pipeline (VBase → Trade Spend → Pujar); status values match
// StatusPillStatus so they bind straight to to-status-pill.
export type ClaimType = 'normal' | 'delay' | 'damage';
export type ClaimStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'overdue';

// Ordered pipeline stages, shared by every claim (CLAUDE.md §8 three-stage pipeline).
export const CLAIM_PIPELINE_STAGES = ['VBase', 'Trade Spend', 'Pujar'] as const;

export interface ClaimRecord {
  id: string; // e.g. CLM-2026-001
  type: ClaimType;
  region: string;
  amount: number; // PKR, integer
  currentStageIndex: number; // index into CLAIM_PIPELINE_STAGES
  status: ClaimStatus;
  raisedBy: string;
}
