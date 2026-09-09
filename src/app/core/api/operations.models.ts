import { ApiInt } from './api.types';

// ─────────────────────────────────────────────────────────────────────────────
// Contracts for the Administration screens that move work between people, and for the
// ones that report on it. Split from admin.models.ts because these are operational
// (transfers, queues, logs, schedules) rather than identity.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Re-Route Scheme (approval queues) ────────────────────────────────────────

export type ApprovalTable = 'SchemeApprovals' | 'BudgetApprovals' | 'JbpExceptionApprovals';
export type ApprovalStage = 'Role1' | 'Role2' | 'Role3' | 'Rmc';
export type HolderStatus = 'Active' | 'Deactivated' | 'NotAUser';
export type ApprovalQueueSortField = 'PendingCount' | 'Holder' | 'HolderName' | 'OldestInitiated';

export const APPROVAL_TABLE_LABELS: Record<ApprovalTable, string> = {
  SchemeApprovals: 'Scheme approvals',
  BudgetApprovals: 'Budget approvals',
  JbpExceptionApprovals: 'JBP exception approvals',
};

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  Role1: 'Level 1',
  Role2: 'Level 2',
  Role3: 'Level 3',
  Rmc: 'RMC',
};

/**
 * One holder's pending pile at one stage.
 *
 * `holderStatus: NotAUser` is the case that matters. Legacy stored the approver as a free
 * string, and 13,239 rows hold a dropdown placeholder rather than a person — those queues
 * can never drain, because nobody can sign in as them. `isActionable` is false for those.
 */
export interface ApprovalQueueResponse {
  table: ApprovalTable;
  stage: ApprovalStage;
  holder: string;
  holderFullName: string | null;
  holderStatus: HolderStatus;
  pendingCount: ApiInt;
  oldestInitiatedOn: string | null;
  newestInitiatedOn: string | null;
  isActionable: boolean;
}

export interface ApprovalQueuePageResponse {
  items: ApprovalQueueResponse[];
  nextCursor: string | null;
  totalCount: ApiInt;
  totalPendingRows: ApiInt;
  stuckPendingRows: ApiInt;
}

export interface PendingApprovalResponse {
  key: string;
  company: string | null;
  reference: string | null;
  sequence: string | null;
  initiatedBy: string | null;
  initiatedOn: string | null;
  holder: string;
}

export interface PendingApprovalPageResponse {
  items: PendingApprovalResponse[];
  nextCursor: string | null;
  totalCount: ApiInt;
}

/**
 * `expectedCount` is **required and load-bearing**: it comes from the preview, the UPDATE's
 * row count is compared against it, and the whole transaction rolls back with a 409 if they
 * differ. That is what stops a queue that moved in between being half-re-routed.
 */
export interface ReRouteRequest {
  table: ApprovalTable;
  stage: ApprovalStage;
  currentHolder: string;
  newHolder: string;
  expectedCount: number;
}

export interface ReRouteResponse {
  table: ApprovalTable;
  stage: ApprovalStage;
  currentHolder: string;
  newHolder: string;
  newHolderFullName: string | null;
  movedCount: ApiInt;
  movedKeys: string[];
  keysTruncated: boolean;
}

// ─── Change Budget Ownership ──────────────────────────────────────────────────

export type BudgetOwnerStatus = 'Active' | 'Deactivated' | 'NotAUser';
export type BudgetShellSortField =
  | 'ShellCode'
  | 'BudgetValue'
  | 'Description'
  | 'Product'
  | 'InitiatedOn';

export interface BudgetCodeResponse {
  code: string;
  description: string;
}

export interface BudgetFilterCatalogueResponse {
  years: ApiInt[];
  months: BudgetCodeResponse[];
  schemeTypes: BudgetCodeResponse[];
  regions: BudgetCodeResponse[];
}

/** `dimensionAmbiguous` means the table's dimension could not be resolved uniquely. */
export interface BudgetTableResponse {
  tableName: string;
  dimension: string | null;
  dimensionAmbiguous: boolean;
  shellCount: ApiInt;
}

export interface BudgetOwnerResponse {
  userId: string;
  fullName: string | null;
  status: BudgetOwnerStatus;
  shellCount: ApiInt;
  /** False when the owner cannot act — deactivated, or not a user at all. */
  isActionable: boolean;
}

/**
 * `stuckShellCount` is the number this screen exists for: budgets sitting with someone who
 * cannot act on them. Legacy could not even list those owners — it used an inner join to
 * USERS with no active test, so they simply did not appear.
 */
export interface BudgetScopeResponse {
  tables: BudgetTableResponse[];
  currentOwners: BudgetOwnerResponse[];
  eligibleOwners: BudgetOwnerResponse[];
  totalShellCount: ApiInt;
  stuckShellCount: ApiInt;
}

export interface BudgetProductResponse {
  value: string;
  description: string | null;
  shellCount: ApiInt;
}

export interface BudgetShellResponse {
  shellCode: string;
  year: ApiInt;
  month: ApiInt;
  region: string;
  regionDescription: string | null;
  tableName: string;
  value: string | null;
  productDescription: string | null;
  schemeId: string | null;
  schemeTypeDescription: string | null;
  description: string | null;
  budgetValue: number | string;
  ownerUserId: string;
  ownerFullName: string | null;
  ownerStatus: BudgetOwnerStatus;
  initiatedBy: string | null;
  initiatedOn: string | null;
  initiatorCount: ApiInt;
  approvalRows: ApiInt;
  approvalStarted: boolean;
  /** The shell's owner and its approval chain disagree. */
  ownershipDrifted: boolean;
}

export interface BudgetShellPageResponse {
  items: BudgetShellResponse[];
  nextCursor: string | null;
  totalCount: ApiInt;
  resultsTruncated: boolean;
  filteredCount: ApiInt;
  driftedCount: ApiInt;
}

export interface TransferBudgetOwnershipRequest {
  shellCodes: string[];
  currentOwner: string;
  newOwner: string;
  expectedCount: number;
}

export interface TransferBudgetOwnershipResponse {
  currentOwner: string;
  newOwner: string;
  newOwnerFullName: string | null;
  shellsTransferred: ApiInt;
  approvalRowsUpdated: ApiInt;
  movedShellCodes: string[];
  keysTruncated: boolean;
}

// ─── Change Activity Ownership ────────────────────────────────────────────────

export type ActivityOwnerStatus = 'Active' | 'Deactivated' | 'NotAUser';
export type ActivityCandidateScope = 'Peers' | 'AllActive';
export type ActivitySortField = 'Key' | 'Description' | 'PeriodFrom' | 'InitiatedOn';

export interface ActivityCodeResponse {
  code: string;
  description: string;
}

export interface ActivityFilterCatalogueResponse {
  years: ApiInt[];
  months: ActivityCodeResponse[];
  claimTypes: ActivityCodeResponse[];
}

export interface ActivityOwnerResponse {
  userId: string;
  fullName: string | null;
  status: ActivityOwnerStatus;
  activityCount: ApiInt;
  isActionable: boolean;
}

export interface ActivityScopeResponse {
  currentOwners: ActivityOwnerResponse[];
  totalActivityCount: ApiInt;
  stuckActivityCount: ApiInt;
}

/**
 * `widened` is worth surfacing: it means the peer set was empty and the server fell back to
 * every active user. Silently offering the whole directory when the admin asked for peers
 * would be a different question answered without saying so.
 */
export interface ActivityCandidateResponse {
  candidates: ActivityOwnerResponse[];
  scope: ActivityCandidateScope;
  widened: boolean;
}

/** An activity is keyed by marketing-plan code plus sequence id, never by one alone. */
export interface ActivityKey {
  mpCode: string;
  seqId: string;
}

export interface ActivityResponse {
  mpCode: string;
  seqId: string;
  claimType: string | null;
  description: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  ownerUserId: string;
  lastModifiedBy: string | null;
  initiatedBy: string | null;
  initiatedOn: string | null;
  initiatorCount: ApiInt;
  approvalRows: ApiInt;
  approvalStarted: boolean;
  role1By: string | null;
  role1On: string | null;
  role2By: string | null;
  role2On: string | null;
  role3By: string | null;
  role3On: string | null;
  ownershipDrifted: boolean;
}

export interface ActivityPageResponse {
  items: ActivityResponse[];
  nextCursor: string | null;
  totalCount: ApiInt;
  resultsTruncated: boolean;
  driftedCount: ApiInt;
}

export interface TransferActivityOwnershipRequest {
  activities: ActivityKey[];
  currentOwner: string;
  newOwner: string;
  expectedCount: number;
}

export interface TransferActivityOwnershipResponse {
  currentOwner: string;
  newOwner: string;
  newOwnerFullName: string | null;
  activitiesTransferred: ApiInt;
  approvalRowsUpdated: ApiInt;
  movedKeys: string[];
  keysTruncated: boolean;
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export type ActivityLogActorGroup = 'Users' | 'Admins' | 'Systems' | 'Distributors';
export type ActivityLogSortField =
  | 'CompletedOn'
  | 'UserId'
  | 'Activity'
  | 'TableName'
  | 'UniqueCode';

export interface ActivityLogActorResponse {
  userId: string;
  displayName: string;
}

export interface ActivityLogResponse {
  userId: string;
  userName: string | null;
  completedOn: string | null;
  activity: string | null;
  description: string | null;
  tableName: string | null;
  uniqueCode: string | null;
}

/**
 * **Offset-paged, not keyset.** Unlike every other Administration grid this one reports
 * `page` / `nextPage`, so it is the one screen that can offer numbered paging — and it must
 * not be wired to CursorPager.
 */
export interface ActivityLogPageResponse {
  items: ActivityLogResponse[];
  nextPage: ApiInt | null;
  totalCount: ApiInt;
  page: ApiInt;
  pageSize: ApiInt;
}

// ─── Frequency Configuration ──────────────────────────────────────────────────

export interface FrequencyGroupResponse {
  groupKey: string;
  schemeGroup: string;
}

export interface FrequencySchemeResponse {
  schemeId: string;
  description: string;
}

/**
 * `frequencyGt` / `frequencyFsd` are the general-trade and FSD cadences; `forAccruals`
 * flags whether the scheme feeds accruals. All are integers on the wire but may arrive as
 * strings, hence ApiInt.
 */
export interface FrequencyConfigurationResponse {
  schemeId: string;
  description: string | null;
  schemeGroup: string | null;
  groupKey: string | null;
  frequencyGt: ApiInt;
  frequencyFsd: ApiInt;
  forAccruals: ApiInt;
  activeFlag: ApiInt;
  budgetPriorMonths: ApiInt;
  claimPriorMonths: ApiInt;
}

export interface FrequencyConfigurationWriteResponse {
  updatedCount: ApiInt;
  items: FrequencyConfigurationResponse[];
}

export interface UpdateFrequencyRequest {
  frequencyGt: number;
  frequencyFsd: number;
}

export interface UpdateAccrualRequest {
  forAccruals: number;
}

/** Applies one prior-month window across several schemes at once. */
export interface UpdatePriorMonthsRequest {
  schemeIds: string[];
  months: number;
}

// ─── Integration ──────────────────────────────────────────────────────────────

export type IntegrationRunKind = 'AutoDaRelease' | 'BatchStatusPush';
export type IntegrationRunState =
  | 'Queued'
  | 'Running'
  | 'Succeeded'
  | 'CompletedWithFailures'
  | 'Failed'
  | 'Cancelled';

export interface IntegrationRunItemResponse {
  key: string;
  outcome: string;
  statusCode: ApiInt | null;
  detail: string | null;
}

export interface IntegrationRunResponse {
  runId: string;
  kind: IntegrationRunKind;
  state: IntegrationRunState;
  actor: string | null;
  description: string | null;
  dryRun: boolean;
  stage: string | null;
  total: ApiInt;
  processed: ApiInt;
  succeeded: ApiInt;
  partial: ApiInt;
  failed: ApiInt;
  skipped: ApiInt;
  closedWithoutPosting: ApiInt;
  queuedAtUtc: string | null;
  startedAtUtc: string | null;
  completedAtUtc: string | null;
  durationSeconds: number | string | null;
  error: string | null;
  items: IntegrationRunItemResponse[];
}

export interface IntegrationRunPageResponse {
  count: ApiInt;
  runs: IntegrationRunResponse[];
}

export interface BatchSummaryRowResponse {
  batch: string;
  batchCode: string | null;
  material: string | null;
  code: string | null;
  saleAllowed: string | null;
  batchStatus: ApiInt | null;
}

/** `sapAvailable: false` means SAP did not answer — the rows are whatever is cached. */
export interface BatchSummaryResponse {
  sapAvailable: boolean;
  lookbackDays: ApiInt;
  count: ApiInt;
  rows: BatchSummaryRowResponse[];
}

export interface StartBatchPushRequest {
  batchNumbers: string[];
  dryRun: boolean;
}

export interface StartAutoDaReleaseRequest {
  period: string | null;
  deliveryNumber: string | null;
  dryRun: boolean;
}

export interface RunAcceptedResponse {
  runId: string;
  kind: IntegrationRunKind;
  dryRun: boolean;
  statusUrl: string | null;
}
