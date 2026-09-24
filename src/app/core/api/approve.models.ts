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

import { ApiDecimal, ApiInt } from './api.types';

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

// ─── Trade Offers (MenuID 5, Approve_Scheme.aspx + View_TradePromotions.aspx) ──

/** Who a level's acceptance goes to. */
export type ApproveTradeOfferForwarding =
  /** Level 1: each scheme's budget owner, automatically — legacy disabled Forward To here. */
  | 'BudgetOwner'
  /** Level 2: a user picked from the catalogue's `forwardTo` — legacy's Forward To dropdown. */
  | 'ChosenApprover'
  /** Level 3: nobody; accepting approves the scheme and posts it to Salesflo or Orange. */
  | 'None';

/** Where a scheme runs once approved: Salesflo (legacy "OBEE") or Orange. */
export type ApproveTradeOfferDatabase = 'Salesflo' | 'Orange';

/** A level of the trade offer chain the caller signs at: 1 RSM, 2 budget owner, 3 FBP. */
export interface ApproveTradeOfferLevelResponse {
  level: ApiInt;
  /** The role the caller holds it through; several are joined with " / ". */
  roleName: string;
  pendingCount: ApiInt;
  /** Their total discount — legacy's footer. */
  totalDiscount: ApiDecimal;
  forwarding: ApproveTradeOfferForwarding;
}

/** `GET /approve/trade-offers/catalogue`. */
export interface ApproveTradeOfferCatalogueResponse {
  /** Lowest first. Empty when the caller approves nothing. */
  levels: ApproveTradeOfferLevelResponse[];
  pendingCount: ApiInt;
  totalDiscount: ApiDecimal;
  /** Level 2's Forward To list. Empty unless the caller holds level 2. */
  forwardTo: ApproveUserResponse[];
  /** False when this host does not post to Salesflo: a Salesflo scheme cannot be finally approved here. */
  salesfloAvailable: boolean;
}

/** Salesflo's last answer about a scheme — legacy's OBEE Status, Code and Message columns. */
export interface ApproveTradeOfferSalesfloResponse {
  status: string;
  code: string;
  message: string;
}

/** A scheme waiting on the caller — a row of legacy's "Pending Schemes for Approval" grid. */
export interface ApproveTradeOfferResponse {
  /** `pbs_seqid`; the project code is always 002. */
  seqId: string;
  schemeId: string;
  description: string;
  from?: string | null;
  to?: string | null;
  claimType: string;
  claimTypeName: string;
  processDescription: string;
  /** The budget the scheme draws on. */
  shellCode: string;
  /** The budget's owner: who a level 1 acceptance goes to. */
  budgetOwner?: ApproveUserResponse | null;
  budgetOwnerActive: boolean;
  criterion: string;
  dimension: string;
  value: string;
  valueName: string;
  regionCode: string;
  regionName: string;
  year: ApiInt;
  month: ApiInt;
  monthName: string;
  businessType: string;
  businessTypeName: string;
  grossProfitPerLitre: ApiDecimal;
  totalDiscount: ApiDecimal;
  activatedVolume: ApiDecimal;
  perLitreDiscount: ApiDecimal;
  roi: ApiDecimal;
  uplift: ApiDecimal;
  database: ApproveTradeOfferDatabase;
  /** Present when Salesflo was posted to and refused it before. */
  salesflo?: ApproveTradeOfferSalesfloResponse | null;
  /** The first slab's "quantity from" — legacy's "Quantity For". */
  quantityFrom?: ApiDecimal | null;
  quantityTo?: ApiDecimal | null;
  level: ApiInt;
  isFinal: boolean;
  waitingSince?: string | null;
  /** The RMC who sent it for approval, and who hears of a rejection. */
  initiatedBy?: ApproveUserResponse | null;
  initiatedOn?: string | null;
  approvalSteps: ApproveBudgetStepResponse[];
}

/** `GET /approve/trade-offers/pending` — one page. */
export interface ApproveTradeOfferPageResponse {
  items: ApproveTradeOfferResponse[];
  totalCount: ApiInt;
  /** Every matching scheme's total discount, not just the page's. */
  totalDiscount: ApiDecimal;
  page: ApiInt;
  pageSize: ApiInt;
  nextPage?: ApiInt | null;
}

/** Filters shared by the pending list and its CSV export. */
export interface ApproveTradeOfferQuery {
  level?: number | null;
  /** Anywhere in the sequence id, scheme id, description or shell code. */
  search?: string | null;
}

/** A code of a criterion and its name; the name is empty when the code no longer resolves. */
export interface ApproveTradeOfferCodeResponse {
  code: string;
  name: string;
}

/** One criterion of the scheme — a line group of legacy's "Scheme Criteria" box. */
export interface ApproveTradeOfferCriterionResponse {
  criterion: string;
  /** Its label, e.g. Region. */
  dimension: string;
  /** True for `<>`: the codes are excluded rather than included. */
  excluded: boolean;
  values: ApproveTradeOfferCodeResponse[];
}

/** One slab — a row of legacy's "Scheme Slabs" grid. */
export interface ApproveTradeOfferSlabResponse {
  serialNo: ApiInt;
  quantityFrom: ApiDecimal;
  quantityTo: ApiDecimal;
  discountValue: ApiDecimal;
  purchaseLimit: ApiDecimal;
  forecastLimit: ApiDecimal;
  /** Legacy's "For Every". */
  forEvery: ApiDecimal;
}

/** The Discount Mechanics block, with the budget as it stands. */
export interface ApproveTradeOfferMechanicsResponse {
  shellCode: string;
  grossProfitPerLitre: ApiDecimal;
  totalDiscount: ApiDecimal;
  activatedVolume: ApiDecimal;
  baselineVolume: ApiDecimal;
  incrementalVolume: ApiDecimal;
  incrementalGrossProfit: ApiDecimal;
  postSchemeDip: ApiDecimal;
  incrementalProfit: ApiDecimal;
  roi: ApiDecimal;
  uplift: ApiDecimal;
  database: ApproveTradeOfferDatabase;
  salesflo?: ApproveTradeOfferSalesfloResponse | null;
  /** The shell's `BUDGET_VALUE`. */
  totalBudget: ApiDecimal;
  /** Every other scheme on the shell's total discount. */
  allocatedElsewhere: ApiDecimal;
  /** Total budget less what other schemes hold — legacy's "Available Budget". */
  availableBudget: ApiDecimal;
}

/** `GET /approve/trade-offers/{seqId}` — the View link, `View_TradePromotions.aspx`. */
export interface ApproveTradeOfferDetailResponse {
  seqId: string;
  schemeId: string;
  description: string;
  from?: string | null;
  to?: string | null;
  discountType: string;
  discountTypeName: string;
  schemeType: string;
  schemeTypeName: string;
  claimType: string;
  claimTypeName: string;
  claimPercentage: ApiDecimal;
  expired: boolean;
  /** The scheme's creator. */
  owner?: ApproveUserResponse | null;
  createdOn?: string | null;
  businessType: string;
  businessTypeName: string;
  slabs: ApproveTradeOfferSlabResponse[];
  criteria: ApproveTradeOfferCriterionResponse[];
  mechanics?: ApproveTradeOfferMechanicsResponse | null;
  initiatedBy?: ApproveUserResponse | null;
  initiatedOn?: string | null;
  approvalSteps: ApproveBudgetStepResponse[];
  /** The level it waits on the caller at; omitted when it does not — accept and reject apply only then. */
  pendingLevel?: ApiInt | null;
}

/** Body of `POST /approve/trade-offers/accept`. */
export interface ApproveTradeOfferAcceptRequest {
  seqIds: string[];
  /** Required when any scheme waits at level 2; ignored at levels 1 and 3. */
  forwardToUserId?: string | null;
}

/** Body of `POST /approve/trade-offers/reject`. */
export interface ApproveTradeOfferRejectRequest {
  seqIds: string[];
}

/** What happened to one scheme of an accept or a reject. */
export type ApproveTradeOfferOutcome =
  /** Signed at level 1 or 2 and forwarded to the next approver. */
  | 'Forwarded'
  /** Signed at level 3 and approved (posted to Salesflo, which accepted it, or an Orange scheme). */
  | 'Approved'
  /** Salesflo refused it; its answer is recorded and the initiator told. It still waits on the caller. */
  | 'RefusedBySalesflo'
  /** Salesflo could not be reached or answered unreadably. It still waits and can be accepted again. */
  | 'PostingFailed'
  /** It runs in Salesflo and this host does not post there. Nothing was written. */
  | 'PostingUnavailable'
  /** A section of the promotion is empty, which Salesflo refuses. Nothing was written; reject it. */
  | 'NotPostable'
  /** Level 1: its budget owner cannot receive it. Nothing was written. */
  | 'CannotForward'
  /** Returned to its initiator. */
  | 'Rejected'
  /** Its final approval is being posted by another request right now. Nothing was written. */
  | 'Busy'
  /** No longer waits on the caller — decided elsewhere. Nothing was written. */
  | 'NotPending'
  /** No trade offer has this sequence id. */
  | 'NotFound';

/** One scheme of an accept or a reject. */
export interface ApproveTradeOfferDecisionItemResponse {
  seqId: string;
  outcome: ApproveTradeOfferOutcome;
  level?: ApiInt | null;
  /** The next approver, or the initiator. */
  notifiedUser?: ApproveUserResponse | null;
  notification: ApproveNotificationState;
  /** Salesflo's answer, when the scheme was posted. */
  salesflo?: ApproveTradeOfferSalesfloResponse | null;
  /** Why it was not acted on, or a note on how it was. */
  message?: string | null;
}

/** The result of an accept or a reject, one item per requested scheme, in request order. */
export interface ApproveTradeOfferDecisionResponse {
  actedOn: ApiInt;
  skipped: ApiInt;
  items: ApproveTradeOfferDecisionItemResponse[];
}
