// Type-only imports reuse the shared component shapes without pulling the components into
// any eager graph (the mock claims store is provided at root in app.config.ts).
import type { ApprovalStep } from '../../../shared/components/approval-chain/approval-chain.component';
import type { ActivityEntry } from '../../../shared/components/activity-timeline/activity-timeline.component';

// A claim entity (CLAUDE.md §8 Claims). Three claim types and a three-stage pipeline
// (VBase → Trade Spend → Pujar). Status values match StatusPillStatus so they bind straight
// to to-status-pill. The list uses a subset of these fields; the detail screen uses all.
export type ClaimType = 'normal' | 'delay' | 'damage';
export type ClaimStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'overdue';

// Ordered pipeline stages, shared by every claim (CLAUDE.md §8 three-stage pipeline).
export const CLAIM_PIPELINE_STAGES = ['VBase', 'Trade Spend', 'Pujar'] as const;

export const CLAIM_TYPE_OPTIONS: { label: string; value: ClaimType }[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'Delay', value: 'delay' },
  { label: 'Damage', value: 'damage' },
];

export const CLAIM_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

// Regions available in the mock data set (mirrors MOCK_USERS / budget mock regions).
export const CLAIM_REGIONS = [
  'Punjab-North',
  'Punjab-South',
  'Sindh',
  'KPK',
  'Balochistan',
] as const;

export interface ClaimRecord {
  id: string; // e.g. CLM-2026-201
  type: ClaimType;
  region: string;
  head: string;
  month: string;
  year: number;
  amount: number; // PKR, integer
  documentName?: string;
  remarks?: string;
  currentStageIndex: number; // index into CLAIM_PIPELINE_STAGES
  status: ClaimStatus;
  raisedBy: string;
  createdAt: string; // ISO date string
  steps: ApprovalStep[];
  currentStepIndex: number;
  activity: ActivityEntry[];
}

// Payload from the creation form — the fields a user actually enters. The store derives
// id / status / stage / chain / activity / createdAt when the claim is created.
export interface NewClaimInput {
  type: ClaimType;
  region: string;
  head: string;
  month: string;
  year: number;
  amount: number;
  documentName?: string;
  remarks?: string;
}
