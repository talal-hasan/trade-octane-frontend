// ─────────────────────────────────────────────────────────────────────────────
// Initiate contracts — the screens under Initiate (MenuID 1), served from
// `/api/v1/initiate/...`. This is where schemes are defined and sent for approval.
//
// Business screens, like Master Data's: every endpoint acts as the signed-in user, on that
// user's own schemes, and is authorised on the screen's own menu grant, as the legacy page's
// GetUserMenuAccess was.
//
// Wire integers are `ApiInt` and read through `int()`; wire decimals are `ApiDecimal` and
// read through `dec()` — see api.types.ts for why.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiDecimal, ApiInt } from './api.types';

// ─── Trade Offer - in Litres (MenuID 38, Based_Weight_Return_In_Value.aspx) ──

/** One choice in a picker: the code to send back, and what to show. */
export interface TradeOfferOption {
  code: string;
  name: string;
}

/** A claim type. Only WD (Whole Sale Claim) takes a percentage; every other is saved at 100. */
export interface TradeOfferClaimType {
  code: string;
  name: string;
  claimPercentageEditable: boolean;
}

/**
 * How a criterion's options are narrowed for the caller. `CallerRegions`: Region, Area,
 * Territory, Distributor and Town, to the caller's regions. `Distributor`: POP, listed one
 * distributor at a time.
 */
export type TradeOfferCriterionScope = 'All' | 'CallerRegions' | 'Distributor';

/**
 * One scheme criterion — legacy's dimension dropdown. `criterion` is the value sent back:
 * the dimension's table name, e.g. `GEO_LEVEL6` (Region), `MASTER_SKU`, `POP`.
 */
export interface TradeOfferCriterion {
  criterion: string;
  dimension: string;
  scope: TradeOfferCriterionScope;
}

/**
 * A system an approved scheme can be posted to — `SCHEME_MECHANISM.DB`. Salesflo today; IBY is
 * listed ahead of the move, and becomes pickable when the server says it is available.
 */
export interface TradeOfferDatabaseOption {
  code: string;
  name: string;
  isAvailable: boolean;
}

/** Everything the Trade Offer form needs on load, in one response. */
export interface TradeOfferCatalogueResponse {
  /** `002` — every scheme this screen makes. */
  processCode: string;
  /** The server's date, `yyyy-MM-dd`. A scheme may not start before it. */
  today: string;
  schemeIdMaxLength: ApiInt;
  descriptionMaxLength: ApiInt;
  discountTypes: TradeOfferOption[];
  schemeTypes: TradeOfferOption[];
  claimTypes: TradeOfferClaimType[];
  /** The active criteria this API lists options for, in `SCHEME_CRITERIA` order. */
  criteria: TradeOfferCriterion[];
  /** Where an approved scheme is posted by default — legacy's Database dropdown. */
  database: TradeOfferOption;
  /**
   * Every system the Posted To dropdown lists. Absent from servers older than the IBY change;
   * the screen then offers `database` alone, with IBY shown as not in use yet.
   */
  databases?: TradeOfferDatabaseOption[];
}

/** Where a scheme stands. Only Draft and ReturnedByApprover can be changed. */
export type TradeOfferSchemeStatus = 'Draft' | 'ReturnedByApprover' | 'SentForApproval' | 'Expired';

/** One of the caller's schemes, as the Sequence ID dropdown lists it. */
export interface TradeOfferSchemeSummary {
  sequenceId: string;
  /** The initiator's own code, e.g. `WS_0001_KHI`. */
  schemeId: string;
  description: string;
  fromDate?: string | null;
  toDate?: string | null;
  claimType: string;
  status: TradeOfferSchemeStatus;
  createdOn?: string | null;
}

/** A page of the caller's editable schemes, newest first. `nextPage` is null on the last. */
export interface TradeOfferSchemePage {
  items: TradeOfferSchemeSummary[];
  totalCount: ApiInt;
  page: ApiInt;
  pageSize: ApiInt;
  nextPage?: ApiInt | null;
}

/** The scheme's one slab — a `FIELD_COMB` row. Quantities are litres. */
export interface TradeOfferSlab {
  serialNo: ApiInt;
  fromQuantity: ApiDecimal;
  toQuantity: ApiDecimal;
  /** Given for every `forEvery` litres. */
  discountValue: ApiDecimal;
  /** Always 0 from this screen. */
  purchaseLimit: ApiDecimal;
  /** The litres the scheme is expected to move — the activated volume. */
  forecastLimit: ApiDecimal;
  forEvery: ApiDecimal;
}

export type TradeOfferCriterionOperator = 'Include' | 'Exclude';

/** One saved criterion, with its values named. A code that no longer resolves is named by its code. */
export interface TradeOfferCriterionSelection {
  criterion: string;
  dimension: string;
  operator: TradeOfferCriterionOperator;
  values: TradeOfferOption[];
}

/** A budget shell a scheme can draw on, with its budget as it stands now. */
export interface TradeOfferBudgetShell {
  shellCode: string;
  /** Legacy's label: region-sequence-dimension-product-year-month-description-scheme type. */
  name: string;
  regionCode: string;
  totalBudget: ApiDecimal;
  /** What other schemes' saved mechanics already take from it — drafts included, as legacy counted. */
  allocatedBudget: ApiDecimal;
  availableBudget: ApiDecimal;
}

/** The Discount Mechanics figures, all computed by the server. */
export interface TradeOfferMechanicsFigures {
  grossProfitPerLitre: ApiDecimal;
  totalDiscount: ApiDecimal;
  activatedVolume: ApiDecimal;
  baselineVolume: ApiDecimal;
  postSchemeDip: ApiDecimal;
  incrementalVolume: ApiDecimal;
  incrementalGrossProfit: ApiDecimal;
  incrementalProfit: ApiDecimal;
  roi: ApiDecimal;
  uplift: ApiDecimal;
}

/** A scheme's mechanics — saved, or a calculation made without saving. */
export interface TradeOfferMechanics {
  budgetShellCode?: string | null;
  /** Null when no shell was named, or the named one no longer resolves. */
  budgetShell?: TradeOfferBudgetShell | null;
  figures: TradeOfferMechanicsFigures;
  /** "Discount exceeds Available Budget. Contact Admin." — cannot be saved or sent. */
  exceedsAvailableBudget: boolean;
  database: TradeOfferOption;
}

/** One level of the scheme's approval cycle. */
export interface TradeOfferApprovalStep {
  level: ApiInt;
  userId: string;
  fullName: string;
  approvedOn?: string | null;
}

/** One scheme, whole — what picking a Sequence ID loads. Every write returns it. */
export interface TradeOfferScheme {
  sequenceId: string;
  processCode: string;
  schemeId: string;
  description: string;
  fromDate?: string | null;
  toDate?: string | null;
  discountType: TradeOfferOption;
  schemeType: TradeOfferOption;
  claimType: TradeOfferOption;
  claimPercentage: ApiDecimal;
  status: TradeOfferSchemeStatus;
  /** False once sent for approval or expired: every write is then refused. */
  isEditable: boolean;
  slabs: TradeOfferSlab[];
  criteria: TradeOfferCriterionSelection[];
  /** Null until Save Mechanics. */
  mechanics?: TradeOfferMechanics | null;
  submittedOn?: string | null;
  approvalSteps: TradeOfferApprovalStep[];
  createdOn?: string | null;
  modifiedOn?: string | null;
}

/** A user the scheme can be forwarded to — legacy's Forward To dropdown. */
export interface TradeOfferApprover {
  userId: string;
  fullName: string;
}

/** One reason the scheme cannot be sent yet, in legacy's words. */
export interface TradeOfferIssue {
  code: string;
  message: string;
}

/** "Check for Approval". `approvers` is empty unless `canSubmit`. */
export interface TradeOfferApprovalCheck {
  canSubmit: boolean;
  issues: TradeOfferIssue[];
  approvers: TradeOfferApprover[];
}

export type TradeOfferNotificationState = 'Queued' | 'Disabled' | 'NoEmailAddress' | 'QueueFull';

export interface SubmitTradeOfferResponse {
  scheme: TradeOfferScheme;
  forwardedTo: TradeOfferApprover;
  approverNotification: TradeOfferNotificationState;
}

// ─── Requests ────────────────────────────────────────────────────────────────

/** Create and update. Dates are `yyyy-MM-dd`, in one month, the start not before today. */
export interface SaveTradeOfferSchemeRequest {
  fromDate: string;
  toDate: string;
  schemeId: string;
  description: string;
  discountType: string;
  schemeType: string;
  claimType: string;
  /** WD only: above 0, at most 100. Ignored for every other claim type. */
  claimPercentage: number | null;
}

/** One slab. Every member is required. */
export interface SaveTradeOfferSlabRequest {
  fromQuantity: number;
  toQuantity: number;
  discountValue: number;
  forecastLimit: number;
  forEvery: number;
}

/** Save Mechanics: the shell, and where the scheme is posted (the default when omitted). */
export interface SaveTradeOfferMechanicsRequest {
  budgetShellCode: string;
  database?: string;
}

/** Replaces one criterion's values; an empty list clears it. */
export interface SaveTradeOfferCriterionRequest {
  operator: TradeOfferCriterionOperator;
  values: string[];
}
