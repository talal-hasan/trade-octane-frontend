import type {
  ApprovalStep,
  ApprovalStepStatus,
} from '../../../shared/components/approval-chain/approval-chain.component';
import type { ActivityEntry } from '../../../shared/components/activity-timeline/activity-timeline.component';
import { CLAIM_PIPELINE_STAGES, ClaimRecord, ClaimStatus, NewClaimInput } from '../models/claim.model';

// The three-level claim approval hierarchy (CLAUDE.md §8). Fixed approvers keep the mock
// coherent; a real backend would resolve these dynamically by business type and value.
export const CLAIM_APPROVERS: readonly { role: string; name: string }[] = [
  { role: 'RSM', name: 'Ahmed Bilal' },
  { role: 'Head of Sales', name: 'Farhan Malik' },
  { role: 'Finance', name: 'Nida Sheikh' },
];

export const CLAIM_STEP_COUNT = CLAIM_APPROVERS.length;
export const CLAIM_LAST_STAGE_INDEX = CLAIM_PIPELINE_STAGES.length - 1;

const HOUR_MS = 60 * 60 * 1000;

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

// The step currently awaiting action: the last one once fully approved, otherwise the
// stage index (pipeline stage and approval step advance together in this flow).
export function currentStepFor(stageIndex: number, status: ClaimStatus): number {
  return status === 'approved' ? CLAIM_STEP_COUNT - 1 : stageIndex;
}

// Synthesises the approval chain for a claim at a given stage/status. Earlier levels are
// approved, the current level is pending (or rejected), later levels wait.
export function buildChain(
  stageIndex: number,
  status: ClaimStatus,
  baseTimeMs: number,
): ApprovalStep[] {
  return CLAIM_APPROVERS.map((approver, index) => {
    let stepStatus: ApprovalStepStatus = 'waiting';
    let timestamp: string | undefined;

    if (status === 'approved') {
      stepStatus = 'approved';
      timestamp = iso(baseTimeMs + index * HOUR_MS);
    } else if (index < stageIndex) {
      stepStatus = 'approved';
      timestamp = iso(baseTimeMs + index * HOUR_MS);
    } else if (index === stageIndex) {
      stepStatus = status === 'rejected' ? 'rejected' : 'pending';
      if (status === 'rejected') {
        timestamp = iso(baseTimeMs + index * HOUR_MS);
      }
    }

    return { role: approver.role, name: approver.name, status: stepStatus, timestamp };
  });
}

// Builds a brand-new claim from the form payload: stage 0 (VBase), status Pending, chain
// with the first level pending, and an activity trail seeded with the submission event.
export function createClaimRecord(
  id: string,
  input: NewClaimInput,
  raisedBy: string,
  now: Date = new Date(),
): ClaimRecord {
  const createdAt = now.toISOString();
  const steps = buildChain(0, 'pending', now.getTime());
  return {
    id,
    type: input.type,
    region: input.region,
    head: input.head,
    month: input.month,
    year: input.year,
    amount: input.amount,
    documentName: input.documentName,
    remarks: input.remarks,
    currentStageIndex: 0,
    status: 'pending',
    raisedBy,
    createdAt,
    steps,
    currentStepIndex: 0,
    activity: buildActivity(raisedBy, steps, createdAt),
  };
}

// Approves the current chain level: marks it approved, activates the next level, advances
// the pipeline one stage, and appends an activity entry. When the last level is approved the
// claim becomes fully Approved and the pipeline holds at the final stage.
export function approveClaim(
  claim: ClaimRecord,
  remarks: string,
  approverName: string,
  now: Date = new Date(),
): ClaimRecord {
  const ts = now.toISOString();
  const currentIndex = claim.currentStepIndex;
  const role = claim.steps[currentIndex]?.role ?? '';

  const steps: ApprovalStep[] = claim.steps.map((step, index) =>
    index === currentIndex
      ? { ...step, status: 'approved' as const, timestamp: ts, remarks: remarks || step.remarks }
      : { ...step },
  );

  const isLast = currentIndex >= steps.length - 1;
  let nextStepIndex = currentIndex;
  if (!isLast) {
    nextStepIndex = currentIndex + 1;
    steps[nextStepIndex] = { ...steps[nextStepIndex], status: 'pending' as const };
  }

  const activity: ActivityEntry[] = [
    ...claim.activity,
    { actor: approverName, action: `approved at ${role}`, timestamp: ts, remarks: remarks || undefined },
  ];

  return {
    ...claim,
    steps,
    currentStepIndex: nextStepIndex,
    currentStageIndex: Math.min(claim.currentStageIndex + 1, CLAIM_LAST_STAGE_INDEX),
    status: isLast ? 'approved' : 'pending',
    activity,
  };
}

// Rejects the claim at the current level: marks it rejected, stops the pipeline (stage
// unchanged), sets status to Rejected, and appends an activity entry.
export function rejectClaim(
  claim: ClaimRecord,
  remarks: string,
  approverName: string,
  now: Date = new Date(),
): ClaimRecord {
  const ts = now.toISOString();
  const currentIndex = claim.currentStepIndex;
  const role = claim.steps[currentIndex]?.role ?? '';

  const steps: ApprovalStep[] = claim.steps.map((step, index) =>
    index === currentIndex
      ? { ...step, status: 'rejected' as const, timestamp: ts, remarks }
      : { ...step },
  );

  const activity: ActivityEntry[] = [
    ...claim.activity,
    { actor: approverName, action: `rejected at ${role}`, timestamp: ts, remarks },
  ];

  return { ...claim, steps, status: 'rejected', activity };
}

// Builds the audit trail (oldest first) from the creation event plus each resolved step.
export function buildActivity(
  raisedBy: string,
  chain: ApprovalStep[],
  createdAt: string,
): ActivityEntry[] {
  const entries: ActivityEntry[] = [
    { actor: raisedBy, action: 'submitted the claim', timestamp: createdAt },
  ];
  for (const step of chain) {
    if (step.status === 'approved' && step.timestamp) {
      entries.push({
        actor: step.name,
        action: `approved at ${step.role}`,
        timestamp: step.timestamp,
        remarks: step.remarks,
      });
    } else if (step.status === 'rejected' && step.timestamp) {
      entries.push({
        actor: step.name,
        action: `rejected at ${step.role}`,
        timestamp: step.timestamp,
        remarks: step.remarks,
      });
    }
  }
  return entries;
}
