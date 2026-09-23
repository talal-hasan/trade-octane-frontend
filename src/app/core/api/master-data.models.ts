// ─────────────────────────────────────────────────────────────────────────────
// Master Data contracts — the screens under Master Data (MenuID 35), served from
// `/api/v1/master-data/...`.
//
// These are business screens, not administration ones: every endpoint acts as the signed-in
// user (their scheme groups, their brand mapping, their own budgets), and is authorised on
// the screen's own menu grant, as the legacy page's GetUserMenuAccess was.
//
// Wire integers are `ApiInt` and read through `int()`, as everywhere else — see
// api.types.ts for why.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiInt } from './api.types';

// ─── Create Budget (MenuID 36, Budget.aspx) ──────────────────────────────────

/** A year and month. */
export interface BudgetPeriodResponse {
  year: ApiInt;
  month: ApiInt;
}

/** One choice in a picker: the code to send back, and what to show. */
export interface BudgetOptionResponse {
  code: string;
  name: string;
}

/** A month from `CALENDAR`: its number and short name (`JAN`…`DEC`). */
export interface BudgetMonthResponse {
  month: ApiInt;
  name: string;
}

/**
 * One budget dimension — legacy's Criteria radio buttons. `criterion` is the value sent back
 * and stored on the shell: `PROD_LEVEL2` (Business), `PROD_LEVEL4` (Category), `PROD_LEVEL6`
 * (Brand) or `MASTER_SKU` (Master SKU).
 */
export interface BudgetCriterionResponse {
  criterion: string;
  dimension: string;
}

/** A scheme type the caller may raise a budget against. */
export interface BudgetSchemeTypeResponse {
  schemeTypeId: ApiInt;
  name: string;
  /** The type's own `SCHEME_GROUP`. Key B15 holds DBDP types. */
  schemeGroup: string;
  /** How many months before the current one a budget of this type may still be raised for. */
  backDatedMonths: ApiInt;
  /** The first year and month the create accepts for this type, today. */
  earliestPeriod: BudgetPeriodResponse;
}

/** A scheme group the caller may initiate budgets for, with its active scheme types. */
export interface BudgetSchemeGroupResponse {
  /** `Key_LoadBudgetShell` — what the Forward To list is keyed on. */
  schemeGroupKey: string;
  name: string;
  schemeTypes: BudgetSchemeTypeResponse[];
}

/** Everything the Create Budget form needs on load, in one response. */
export interface BudgetCatalogueResponse {
  /** The server's current year and month — what "back-dated" is measured from. */
  currentPeriod: BudgetPeriodResponse;
  /** The last year and month a budget may be created for. */
  latestPeriod: BudgetPeriodResponse;
  years: ApiInt[];
  months: BudgetMonthResponse[];
  /** The active regions, by name. */
  regions: BudgetOptionResponse[];
  criteria: BudgetCriterionResponse[];
  /** Empty when the caller initiates nothing — the form cannot be saved. */
  schemeGroups: BudgetSchemeGroupResponse[];
}

/** A user a new budget can be forwarded to — legacy's Forward To dropdown. */
export interface BudgetApproverResponse {
  userId: string;
  fullName: string;
}

/** Where a budget stands in its approval cycle. */
export type BudgetApprovalStage =
  | 'Approved'
  | 'AwaitingLevel1'
  | 'AwaitingLevel2'
  | 'AwaitingLevel3'
  /** Rejected by an approver; waits for its initiator to change and resubmit it on Edit Budget. */
  | 'ReturnedToInitiator'
  /** No approval row at all — nobody was ever asked to approve it. */
  | 'NotRouted';

/** One level of a budget's approval cycle: who holds it, and when they signed. */
export interface BudgetApprovalStepResponse {
  /** 1, 2 or 3. */
  level: ApiInt;
  userId: string;
  fullName: string;
  /** Null while the level is still waiting. */
  approvedOn?: string | null;
}

/** One budget shell, as the grids and the create show it. */
export interface BudgetShellResponse {
  shellCode: string;
  serialNumber: ApiInt;
  year: ApiInt;
  month: ApiInt;
  /** `JAN`…`DEC`. */
  monthName: string;
  regionCode: string;
  regionName: string;
  criterion: string;
  /** The criterion's label — Business, Category, Brand, Master SKU. */
  dimension: string;
  value: string;
  /** Empty when the code no longer resolves. */
  valueName: string;
  schemeTypeId: ApiInt;
  schemeType: string;
  schemeGroup: string;
  description: string;
  /** The current amount. Edit Budget and the approvers can change it. */
  amount: ApiInt;
  /** The amount it was created with. */
  originalAmount: ApiInt;
  stage: BudgetApprovalStage;
  /** Omitted once approved, or when nobody is being waited on. */
  pendingWith?: BudgetApproverResponse | null;
  /** The approvers assigned so far, in level order. */
  approvalSteps: BudgetApprovalStepResponse[];
  /** Null after a rejection. */
  initiatedOn?: string | null;
  approvedOn?: string | null;
}

/** A page of one of the two grids. `nextPage` is omitted on the last page. */
export interface BudgetPageResponse {
  items: BudgetShellResponse[];
  /** Every budget in the grid, not just this page. */
  totalCount: ApiInt;
  page: ApiInt;
  pageSize: ApiInt;
  nextPage?: ApiInt | null;
}

/** Which of legacy's two grids to read. */
export type BudgetListStatus = 'pending' | 'approved';

/** Query for either grid. */
export interface BudgetListQuery {
  year?: number | null;
  search?: string | null;
  page?: number;
  pageSize?: number;
}

/** Body of `POST /master-data/budgets` — every member is required. */
export interface CreateBudgetRequest {
  year: number;
  month: number;
  regionCode: string;
  criterion: string;
  value: string;
  schemeTypeId: number;
  /** At most 1,000 characters. */
  description: string;
  /** A whole number from 1. */
  amount: number;
  forwardToUserId: string;
}

/** What happened to the approval-request email sent to the Forward To user. */
export type BudgetNotificationState = 'Queued' | 'Disabled' | 'NoEmailAddress' | 'QueueFull';

/** The created budget, and whether its approver is being told. */
export interface CreateBudgetResponse {
  budget: BudgetShellResponse;
  /** The shell's position among the budgets for the same year, month and region. */
  sequence: ApiInt;
  approverNotification: BudgetNotificationState;
}
