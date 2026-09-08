// Type-only import: reuses the ApprovalStep shape without pulling the approval-chain
// component into the eager app.config graph (the mock service is provided at root).
import type { ApprovalStep } from '../../../shared/components/approval-chain/approval-chain.component';

// An item awaiting the current user's decision in the approvals inbox. Spans the three
// approvable record types (Budget, Scheme, Claim) — the inbox is the single queue-mode
// triage surface described in CLAUDE.md §7. Type-specific detail (headroom for budgets,
// pipeline for claims) is carried optionally so the detail pane renders what applies.
export type ApprovalItemType = 'budget' | 'scheme' | 'claim';

export interface ApprovalHeadroom {
  total: number;
  consumed: number;
  pending: number;
}

export interface ApprovalInboxItem {
  id: string;
  type: ApprovalItemType;
  reference: string; // e.g. BUD-2026-014, BRD-0042, CLM-2026-231
  title: string;
  summary: string;
  requestedBy: string;
  requestedAt: string; // ISO date string
  region: string;
  brand?: string;
  amount: number; // PKR, integer
  // Permission the current user needs to approve/reject this item (CLAUDE.md §4).
  requiredPermission: string;
  // Budget items only — drives the headroom bar in the detail pane.
  headroom?: ApprovalHeadroom;
  // Claim items only — drives the pipeline-stage component in the detail pane.
  pipelineStages?: string[];
  currentStageIndex?: number;
  // Approval chain, shared across all types.
  steps: ApprovalStep[];
  currentStepIndex: number;
}

export type ApprovalDecision = 'approve' | 'reject';
