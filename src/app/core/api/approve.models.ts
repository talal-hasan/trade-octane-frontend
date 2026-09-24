// ─────────────────────────────────────────────────────────────────────────────
// Approve contracts — the screens under Approve (MenuID 2), served from
// `/api/v1/approve/...`.
//
// Business screens, not administration ones: every endpoint acts as the signed-in approver
// (the levels they hold, the budgets named as waiting on them, their regions' next
// approvers) and is authorised on the screen's own menu grant, as the legacy page's
// GetUserMenuAccess was.
//
// Wire integers are `ApiInt` and read through `int()`, as everywhere else — see
// api.types.ts for why.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiInt } from './api.types';

// ─── Budgets (MenuID 40, Approve_Budget.aspx) ────────────────────────────────

/** A user the screen names: an approver, an initiator, or a Forward To choice. */
export interface ApproveUserResponse {
  userId: string;
  fullName: string;
}

/** One level of a scheme group's budget approval cycle that the caller signs at. */
export interface ApproveBudgetLevelResponse {
  /** 1, 2 or 3 — `ROLE1`…`ROLE3` on the budget. */
  level: ApiInt;
  /** The role the caller holds this level through, e.g. TCM; several are joined with " / ". */
  roleName: string;
  /** Budgets waiting on the caller at this level. */
  pendingCount: ApiInt;
  /** True for level 3: accepting approves the budget, and there is no one to forward it to. */
  isFinal: boolean;
  /**
   * Legacy's Forward To dropdown: the active holders of the group's next level who share a
   * region with the caller. Empty for the final level. Empty for a forwarding level means
   * nobody is set up to receive the budget, so it can be rejected but not accepted.
   */
  forwardTo: ApproveUserResponse[];
}

/** A scheme group the caller approves budgets for — one entry of legacy's Budget Type dropdown. */
export interface ApproveBudgetTypeResponse {
  /** `Key_LoadBudgetShell` — the `schemeGroupKey` filter of the pending list. */
  schemeGroupKey: string;
  name: string;
  /** Budgets of this group waiting on the caller, at every level. */
  pendingCount: ApiInt;
  levels: ApproveBudgetLevelResponse[];
}

/** `GET /approve/budgets/catalogue` — everything the screen needs on load. */
export interface ApproveBudgetCatalogueResponse {
  /**
   * Empty when the caller holds no approving level — legacy said "User is not defined in Any
   * Role. Contact Administrator."
   */
  budgetTypes: ApproveBudgetTypeResponse[];
  /** Every budget waiting on the caller. */
  pendingCount: ApiInt;
}

/** One signed or assigned level of a budget's approval cycle. */
export interface ApproveBudgetStepResponse {
  level: ApiInt;
  userId: string;
  fullName: string;
  /** Omitted while the level is still waiting. */
  approvedOn?: string | null;
}

/** One budget waiting on the caller — a row of legacy's "Pending Budgets for Approvals" grid. */
export interface ApproveBudgetResponse {
  shellCode: string;
  serialNumber: ApiInt;
  year: ApiInt;
  month: ApiInt;
  /** `JAN`…`DEC`. */
  monthName: string;
  regionCode: string;
  regionName: string;
  /** `PROD_LEVEL2`, `PROD_LEVEL4`, `PROD_LEVEL6` or `MASTER_SKU`. */
  criterion: string;
  /** The criterion's label — Business, Category, Brand, Master SKU. */
  dimension: string;
  value: string;
  /** Empty when the code no longer resolves. */
  valueName: string;
  schemeTypeId: ApiInt;
  schemeType: string;
  schemeGroup: string;
  /** The catalogue's key: the group the budget is approved under. */
  schemeGroupKey: string;
  description: string;
  /** The current amount — legacy's "Value" column. */
  amount: ApiInt;
  /** The amount it was created with. */
  originalAmount: ApiInt;
  /** The level it waits on the caller at. */
  level: ApiInt;
  /** True at level 3: accepting it approves the budget. */
  isFinal: boolean;
  /** When it reached the caller. The list is ordered by it, longest waiting first. */
  waitingSince?: string | null;
  /** Who raised it, or last resubmitted it on Edit Budget. */
  initiatedBy?: ApproveUserResponse | null;
  initiatedOn?: string | null;
  /** The approvers assigned so far, in level order, the caller's own level included. */
  approvalSteps: ApproveBudgetStepResponse[];
}

/** `GET /approve/budgets/pending` — one page. `nextPage` is omitted on the last page. */
export interface ApproveBudgetPageResponse {
  items: ApproveBudgetResponse[];
  /** Every budget matching, not just this page. */
  totalCount: ApiInt;
  page: ApiInt;
  pageSize: ApiInt;
  nextPage?: ApiInt | null;
}

/** Filters shared by the pending list and its CSV export. */
export interface ApproveBudgetQuery {
  schemeGroupKey?: string | null;
  /** 1, 2 or 3. */
  level?: number | null;
  /** Anywhere in the shell code or the description. */
  search?: string | null;
}

/** Body of `POST /approve/budgets/accept` — Submit with Accept selected. */
export interface ApproveBudgetAcceptRequest {
  shellCodes: string[];
  /**
   * Required when any budget waits at level 1 or 2: a user on the catalogue's `forwardTo`
   * list of every such budget's group and level. Ignored at level 3.
   */
  forwardToUserId?: string | null;
}

/** Body of `POST /approve/budgets/reject` — Submit with Reject selected. */
export interface ApproveBudgetRejectRequest {
  shellCodes: string[];
}

/** What happened to one budget of an accept or a reject. */
export type ApproveBudgetOutcome =
  /** Signed at level 1 or 2 and forwarded to the next approver. */
  | 'Forwarded'
  /** Signed at level 3: the budget is approved. */
  | 'Approved'
  /** Returned to its initiator, who can change and resubmit it on Edit Budget. */
  | 'Rejected'
  /** Exists but no longer waits on the caller — decided elsewhere. Nothing was written. */
  | 'NotPending'
  /** No budget has this shell code. */
  | 'NotFound';

/** What happened to the email legacy sent after each budget. */
export type ApproveNotificationState =
  /** Sent after the response, so a slow mail server does not hold up the submit. */
  | 'Queued'
  /** `Approve:Notifications` is off on this host. */
  | 'Disabled'
  /** The recipient has no email address. */
  | 'NoEmailAddress'
  /** Too many emails were waiting; this one was dropped and logged. */
  | 'QueueFull'
  /** No email for this outcome: none on the final approval, none for a skipped budget. */
  | 'None';

/** One budget of an accept or a reject. */
export interface ApproveBudgetDecisionItemResponse {
  shellCode: string;
  outcome: ApproveBudgetOutcome;
  /** The level the caller acted at. Omitted when skipped. */
  level?: ApiInt | null;
  /** The Forward To user for a forwarded budget, the initiator for a rejected one. */
  notifiedUser?: ApproveUserResponse | null;
  notification: ApproveNotificationState;
}

/** The result of an accept or a reject, one item per requested budget, in request order. */
export interface ApproveBudgetDecisionResponse {
  /** Forwarded, approved or rejected. */
  actedOn: ApiInt;
  /** Not waiting on the caller, or not found. Nothing was written for them. */
  skipped: ApiInt;
  /** Omitted when nothing was acted on. */
  decidedOn?: string | null;
  items: ApproveBudgetDecisionItemResponse[];
}
