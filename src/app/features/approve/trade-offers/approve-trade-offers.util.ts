import { HttpErrorResponse } from '@angular/common/http';

import { dec, int } from '../../../core/api/api.types';
import {
  ApproveBudgetStepResponse,
  ApproveTradeOfferCatalogueResponse,
  ApproveTradeOfferDatabase,
  ApproveTradeOfferDecisionItemResponse,
  ApproveTradeOfferMechanicsResponse,
  ApproveTradeOfferOutcome,
  ApproveTradeOfferResponse,
  ApproveTradeOfferSalesfloResponse,
  ApproveUserResponse,
} from '../../../core/api/approve.models';
import { isRefusal, messageFor, serverDetail } from '../../../core/interceptors/error.interceptor';
import { ApprovalStep } from '../../../shared/components/approval-chain/approval-chain.component';
import { StatusPillStatus } from '../../../shared/components/status-pill/status-pill.component';
import { daysSince, emailNote } from '../shared/approve-common.util';

// Pure helpers for Approve → Trade Offers: no Angular, no signals, so every rule the screen
// states before a click can be tested on its own. The server checks the same rules on submit.

/** Level 1 goes to the budget owner, level 2 to a chosen FBP; level 3 approves. */
export const FINAL_LEVEL = 3;

/** `Approve:MaxBatchSize` — the most schemes one accept or reject may carry. */
export const MAX_BATCH = 200;

/**
 * `Approve:MaxFinalApprovalsPerRequest`. Each final approval of a Salesflo scheme is a round
 * trip to Salesflo, so one request carries at most this many.
 */
export const MAX_FINALS = 20;

/** Legacy's own names for the three levels of the trade offer chain. */
const LEVEL_ROLES: Readonly<Record<number, string>> = { 1: 'RSM', 2: 'Budget owner', 3: 'FBP' };

export function levelRole(level: number): string {
  return LEVEL_ROLES[level] ?? `Level ${level}`;
}

export function levelLabel(level: number): string {
  return level >= FINAL_LEVEL ? `Level ${level} · final` : `Level ${level} of ${FINAL_LEVEL}`;
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

const WHOLE = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const TWO = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LITRES = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 4 });
const PLAIN = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 6 });

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * `PKR 20,710`, or `PKR 20,710.40` when there are paise — as Initiate's Trade Offer shows the
 * same figures. Discounts are computed to 2 places; rounding them away could hide the fraction
 * by which one exceeds its budget.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  const rounded = round2(value);
  return `PKR ${Number.isInteger(rounded) ? WHOLE.format(rounded) : TWO.format(rounded)}`;
}

/** `4,142.4 L`. */
export function formatLitres(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : `${LITRES.format(value)} L`;
}

/** `5.00` — a per-litre figure. */
export function formatRate(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : TWO.format(value);
}

/** `440%` — ROI and uplift, as Initiate's Trade Offer shows them. */
export function formatPercent(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : `${TWO.format(value)}%`;
}

export function formatPlain(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : PLAIN.format(value);
}

/** Legacy's grid: ROI and uplift in green above zero, red at or below it. */
export function tone(value: number): 'good' | 'bad' {
  return value > 0 ? 'good' : 'bad';
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

/** One pending scheme, read once from the wire into the numbers and text the grid uses. */
export interface SchemeRow {
  seqId: string;
  schemeId: string;
  description: string;
  from: string | null;
  to: string | null;
  /** `01 – 07 Oct 2026`. */
  period: string;
  /** For sorting by period; 0 when unknown. */
  fromTime: number;
  claimTypeName: string;
  shellCode: string;
  budgetOwner: ApproveUserResponse | null;
  budgetOwnerActive: boolean;
  product: string;
  dimension: string;
  regionName: string;
  businessTypeName: string;
  totalDiscount: number;
  perLitreDiscount: number;
  activatedVolume: number;
  roi: number;
  uplift: number;
  database: ApproveTradeOfferDatabase;
  /** Salesflo's last answer, when it refused the scheme before. */
  salesflo: ApproveTradeOfferSalesfloResponse | null;
  level: number;
  isFinal: boolean;
  waitingSince: string | null;
  waitingDays: number | null;
  initiatedBy: ApproveUserResponse | null;
  initiatedOn: string | null;
  steps: ApproveBudgetStepResponse[];
  /** Sequence id, scheme id, description and shell code, lower-cased — what the server searches. */
  searchText: string;
}

const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
const DAY_MONTH = new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short' });
const DAY = new Intl.DateTimeFormat('en-PK', { day: '2-digit' });

function toDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `01 – 07 Oct 2026`, `28 Sep – 04 Oct 2026`, `28 Dec 2026 – 03 Jan 2027`. */
export function periodRange(from: string | null | undefined, to: string | null | undefined): string {
  const start = toDate(from);
  const end = toDate(to);
  if (!start && !end) {
    return '—';
  }
  if (!start || !end) {
    return DAY_MONTH_YEAR.format((start ?? end)!);
  }
  if (start.getFullYear() !== end.getFullYear()) {
    return `${DAY_MONTH_YEAR.format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${DAY_MONTH.format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
  }
  return `${DAY.format(start)} – ${DAY_MONTH_YEAR.format(end)}`;
}

export function toRow(wire: ApproveTradeOfferResponse, now = new Date()): SchemeRow {
  const level = int(wire.level);
  const from = wire.from ?? null;
  const salesflo = wire.salesflo;
  return {
    seqId: wire.seqId,
    schemeId: wire.schemeId,
    description: wire.description,
    from,
    to: wire.to ?? null,
    period: periodRange(from, wire.to),
    fromTime: toDate(from)?.getTime() ?? 0,
    claimTypeName: wire.claimTypeName || wire.claimType,
    shellCode: wire.shellCode,
    budgetOwner: wire.budgetOwner ?? null,
    budgetOwnerActive: wire.budgetOwnerActive,
    product: wire.valueName || wire.value,
    dimension: wire.dimension || wire.criterion,
    regionName: wire.regionName || wire.regionCode,
    businessTypeName: wire.businessTypeName || wire.businessType,
    totalDiscount: dec(wire.totalDiscount),
    perLitreDiscount: dec(wire.perLitreDiscount),
    activatedVolume: dec(wire.activatedVolume),
    roi: dec(wire.roi),
    uplift: dec(wire.uplift),
    database: wire.database === 'Orange' ? 'Orange' : 'Salesflo',
    salesflo: salesflo && (salesflo.status || salesflo.code || salesflo.message) ? salesflo : null,
    level,
    isFinal: wire.isFinal || level >= FINAL_LEVEL,
    waitingSince: wire.waitingSince ?? null,
    waitingDays: daysSince(wire.waitingSince, now),
    initiatedBy: wire.initiatedBy ?? null,
    initiatedOn: wire.initiatedOn ?? null,
    steps: wire.approvalSteps,
    searchText: `${wire.seqId} ${wire.schemeId} ${wire.description} ${wire.shellCode}`.toLowerCase(),
  };
}

// ─── Filtering and sorting ────────────────────────────────────────────────────

export interface RowFilter {
  level: number | null;
  search: string;
}

/**
 * The server's own search rule — anywhere in the sequence id, scheme id, description or shell
 * code — so the grid shows exactly what Send to Excel downloads with the same filters.
 */
export function filterRows(rows: readonly SchemeRow[], filter: RowFilter): SchemeRow[] {
  const term = filter.search.trim().toLowerCase();
  return rows.filter(
    (row) => (filter.level === null || row.level === filter.level) && (term.length === 0 || row.searchText.includes(term)),
  );
}

export type SortKey = 'waiting' | 'discount' | 'roi' | 'period';

export interface RowSort {
  key: SortKey;
  /** `waiting` descending is longest waiting first — the server's queue order. */
  descending: boolean;
}

export const QUEUE_ORDER: RowSort = { key: 'waiting', descending: true };

function waitingValue(row: SchemeRow): number {
  const time = toDate(row.waitingSince)?.getTime();
  // Older first when descending: a smaller timestamp has waited longer.
  return time === undefined ? Number.NEGATIVE_INFINITY : -time;
}

/** Stable: rows that tie keep the server's order. */
export function sortRows(rows: readonly SchemeRow[], sort: RowSort): SchemeRow[] {
  const direction = sort.descending ? -1 : 1;
  const value = (row: SchemeRow): number => {
    switch (sort.key) {
      case 'discount':
        return row.totalDiscount;
      case 'roi':
        return row.roi;
      case 'period':
        return row.fromTime;
      default:
        return waitingValue(row);
    }
  };
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => (a.value !== b.value ? (a.value < b.value ? -direction : direction) : a.index - b.index))
    .map((entry) => entry.row);
}

// ─── The decision ─────────────────────────────────────────────────────────────

/**
 * Why a level 1 scheme cannot go to its budget owner, as the server will refuse it
 * (`CannotForward`), or null. The server also refuses an owner who does not approve trade
 * offers at level 2, which only it can see.
 */
export function ownerIssue(row: SchemeRow, callerId: string): string | null {
  if (row.level !== 1) {
    return null;
  }
  if (!row.budgetOwner) {
    return 'The budget has no owner';
  }
  if (!row.budgetOwnerActive) {
    return `${row.budgetOwner.fullName || row.budgetOwner.userId}'s account is inactive`;
  }
  if (row.budgetOwner.userId.toLowerCase() === callerId.toLowerCase()) {
    return 'You own the budget, and cannot approve it twice';
  }
  return null;
}

/** What Accept would do with the ticked schemes, worked out before the click. */
export interface DecisionPlan {
  /** Level 1: each goes to its budget owner, automatically. */
  toOwners: SchemeRow[];
  /** The owners they go to, most schemes first. */
  owners: { name: string; count: number }[];
  /** Level 1 schemes whose owner cannot receive them — the server will skip them. */
  ownerProblems: SchemeRow[];
  /** Level 2: each goes to the Forward To user. */
  toChosen: SchemeRow[];
  /** Level 3: approved — posted to Salesflo first when they run there. */
  finals: SchemeRow[];
  salesfloFinals: SchemeRow[];
  /** Salesflo finals this host cannot post — the server will skip them. */
  unpostable: SchemeRow[];
}

export function planDecision(
  selected: readonly SchemeRow[],
  catalogue: ApproveTradeOfferCatalogueResponse | null,
  callerId: string,
): DecisionPlan {
  const toOwners = selected.filter((row) => row.level === 1);
  const toChosen = selected.filter((row) => row.level === 2);
  const finals = selected.filter((row) => row.isFinal);
  const salesfloFinals = finals.filter((row) => row.database === 'Salesflo');
  const available = catalogue?.salesfloAvailable !== false;

  const byOwner = new Map<string, { name: string; count: number }>();
  const ownerProblems: SchemeRow[] = [];
  for (const row of toOwners) {
    if (ownerIssue(row, callerId)) {
      ownerProblems.push(row);
      continue;
    }
    const owner = row.budgetOwner!;
    const entry = byOwner.get(owner.userId) ?? { name: owner.fullName || owner.userId, count: 0 };
    entry.count++;
    byOwner.set(owner.userId, entry);
  }

  return {
    toOwners,
    owners: [...byOwner.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    ownerProblems,
    toChosen,
    finals,
    salesfloFinals,
    unpostable: available ? [] : salesfloFinals,
  };
}

/**
 * About how long the final approvals take: each Salesflo post is a round trip of ~7 seconds
 * in the audit trail, four at a time. Orange schemes are approved at once.
 */
export function postingSeconds(salesfloFinals: number): number {
  return salesfloFinals === 0 ? 0 : Math.ceil(salesfloFinals / 4) * 7;
}

/** Who a rejection goes back to, most schemes first. */
export function rejectRecipients(selected: readonly SchemeRow[]): { name: string; count: number }[] {
  const byInitiator = new Map<string, { name: string; count: number }>();
  for (const row of selected) {
    const id = row.initiatedBy?.userId ?? '';
    const name = row.initiatedBy?.fullName || row.initiatedBy?.userId || 'Unknown initiator';
    const entry = byInitiator.get(id) ?? { name, count: 0 };
    entry.count++;
    byInitiator.set(id, entry);
  }
  return [...byInitiator.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ─── The approval chain ───────────────────────────────────────────────────────

export interface ChainSource {
  initiatedBy?: ApproveUserResponse | null;
  initiatedOn?: string | null;
  steps: readonly ApproveBudgetStepResponse[];
  /** The level it waits on the caller at; null when it does not. */
  level: number | null;
  /** The budget owner — level 2 before level 1 has signed. */
  budgetOwner?: ApproveUserResponse | null;
}

/**
 * The chain for `to-approval-chain`: who sent it, the levels signed, the caller's level as
 * current, and the rest — level 2 is always the budget's owner, level 3 is chosen at level 2.
 */
export function approvalChainOf(source: ChainSource): ApprovalStep[] {
  const steps: ApprovalStep[] = [
    {
      role: 'Sent for approval',
      name: source.initiatedBy?.fullName || source.initiatedBy?.userId || 'Unknown initiator',
      status: 'approved',
      timestamp: source.initiatedOn ?? undefined,
    },
  ];
  for (let level = 1; level <= FINAL_LEVEL; level++) {
    const step = source.steps.find((candidate) => int(candidate.level) === level);
    const role = `Level ${level} · ${levelRole(level)}${level === FINAL_LEVEL ? ' · final' : ''}`;
    if (step?.approvedOn && level !== source.level) {
      steps.push({ role, name: step.fullName || step.userId, status: 'approved', timestamp: step.approvedOn });
    } else if (step) {
      steps.push({ role, name: step.fullName || step.userId, status: level === source.level ? 'pending' : 'waiting' });
    } else if (level === 2 && source.budgetOwner) {
      steps.push({ role, name: source.budgetOwner.fullName || source.budgetOwner.userId, status: 'waiting' });
    } else {
      steps.push({ role, name: level === FINAL_LEVEL ? 'Chosen when level 2 approves' : 'Not assigned yet', status: 'waiting' });
    }
  }
  return steps;
}

// ─── Outcomes ─────────────────────────────────────────────────────────────────

/** Outcomes after which the scheme still waits on the caller. */
const STILL_WAITING: ReadonlySet<ApproveTradeOfferOutcome> = new Set<ApproveTradeOfferOutcome>([
  'RefusedBySalesflo',
  'PostingFailed',
  'PostingUnavailable',
  'NotPostable',
  'CannotForward',
  'Busy',
]);

export function stillWaiting(outcome: ApproveTradeOfferOutcome): boolean {
  return STILL_WAITING.has(outcome);
}

export function outcomeLabel(outcome: ApproveTradeOfferOutcome): string {
  switch (outcome) {
    case 'Forwarded':
      return 'Forwarded';
    case 'Approved':
      return 'Approved';
    case 'Rejected':
      return 'Returned';
    case 'RefusedBySalesflo':
      return 'Refused by Salesflo';
    case 'PostingFailed':
      return 'Salesflo unreachable';
    case 'PostingUnavailable':
      return 'Not posted';
    case 'NotPostable':
      return 'Cannot be posted';
    case 'CannotForward':
      return 'Owner cannot receive';
    case 'Busy':
      return 'Being posted';
    case 'NotPending':
      return 'Already decided';
    case 'NotFound':
      return 'Not found';
    default:
      return outcome;
  }
}

export function outcomePill(outcome: ApproveTradeOfferOutcome): StatusPillStatus {
  switch (outcome) {
    case 'Approved':
      return 'approved';
    case 'Forwarded':
      return 'pending';
    case 'Rejected':
    case 'RefusedBySalesflo':
      return 'rejected';
    default:
      return 'needs-attention';
  }
}

/** One line on what an outcome meant, preferring the server's own note where it gave one. */
export function outcomeNote(item: ApproveTradeOfferDecisionItemResponse): string {
  const name = item.notifiedUser?.fullName || item.notifiedUser?.userId || '';
  const salesflo = item.salesflo ? salesfloLine(item.salesflo) : '';
  switch (item.outcome) {
    case 'Forwarded':
      return `To ${name || 'the next approver'} at level ${int(item.level) + 1}. ${emailNote(item.notification)}`;
    case 'Approved':
      return `Approved${salesflo ? ` — Salesflo: ${salesflo}` : ''}. ${emailNote(item.notification)}`.trim();
    case 'Rejected':
      return `Back to ${name || 'its initiator'}. ${emailNote(item.notification)}`;
    case 'RefusedBySalesflo':
      return `Salesflo said: ${salesflo || 'refused'}. It still waits on you; ${name || 'its initiator'} was told.`;
    default:
      return item.message || fallbackNote(item.outcome);
  }
}

function fallbackNote(outcome: ApproveTradeOfferOutcome): string {
  switch (outcome) {
    case 'PostingFailed':
      return 'Salesflo could not be reached. It still waits on you — accept it again.';
    case 'PostingUnavailable':
      return 'It runs in Salesflo, and this server does not post there. Nothing was changed.';
    case 'NotPostable':
      return 'Part of the promotion is empty, which Salesflo refuses. Reject it back to its initiator.';
    case 'CannotForward':
      return 'Its budget owner cannot receive it. Reassign the budget or reject the scheme.';
    case 'Busy':
      return 'Its final approval is being posted by another request. Nothing was changed.';
    case 'NotPending':
      return 'No longer waiting on you — decided or re-routed elsewhere. Nothing was changed.';
    case 'NotFound':
      return 'No trade offer has this sequence id. Nothing was changed.';
    default:
      return '';
  }
}

/** `Failed · E102 · Promotion already exists`, skipping empty parts. */
export function salesfloLine(answer: ApproveTradeOfferSalesfloResponse): string {
  return [answer.status, answer.code, answer.message].filter((part) => part && part.trim()).join(' · ');
}

// ─── Refusals ─────────────────────────────────────────────────────────────────

export type RefusalTarget = 'forwardTo' | 'selection' | null;

export interface DecisionRefusal {
  /** The API's `errorCode` without its `approve.trade_offers.` prefix; empty when there is none. */
  code: string;
  message: string;
  target: RefusalTarget;
  /** A Forward To refusal: the list the panel offered may be out of date. */
  staleForwardTo: boolean;
  /** Someone else held the schemes; nothing was written and the same request may be retried. */
  retryable: boolean;
  /** A fault rather than a refusal — the error interceptor has already shown it as a toast. */
  toasted: boolean;
}

const TARGET_OF: Readonly<Record<string, RefusalTarget>> = {
  forward_to_required: 'forwardTo',
  forward_to_too_long: 'forwardTo',
  unknown_forward_to: 'forwardTo',
  forward_to_not_eligible: 'forwardTo',
  no_schemes: 'selection',
  too_many_schemes: 'selection',
  too_many_final_approvals: 'selection',
  seq_id_invalid: 'selection',
};

export function refusalOf(error: unknown): DecisionRefusal {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      code: '',
      message: 'The decision could not be sent.',
      target: null,
      staleForwardTo: false,
      retryable: false,
      toasted: false,
    };
  }
  const body = error.error as Record<string, unknown> | null;
  const rawCode = body && typeof body === 'object' && typeof body['errorCode'] === 'string' ? body['errorCode'] : '';
  const code = rawCode.replace(/^approve\.trade_offers\./, '');
  return {
    code,
    message: serverDetail(error.error) ?? messageFor(error),
    target: TARGET_OF[code] ?? null,
    staleForwardTo: code === 'unknown_forward_to' || code === 'forward_to_not_eligible',
    retryable: code === 'busy' || error.status === 409,
    toasted: !isRefusal(error),
  };
}

// ─── The scheme view ──────────────────────────────────────────────────────────

export interface Figure {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}

/** Legacy's Discount Mechanics block, in Initiate's Trade Offer labels and formats. */
export function mechanicsFigures(mechanics: ApproveTradeOfferMechanicsResponse): Figure[] {
  const roi = dec(mechanics.roi);
  const uplift = dec(mechanics.uplift);
  return [
    { label: 'Gross profit per litre', value: formatMoney(dec(mechanics.grossProfitPerLitre)) },
    { label: 'Total discount', value: formatMoney(dec(mechanics.totalDiscount)) },
    { label: 'Activated volume', value: formatLitres(dec(mechanics.activatedVolume)) },
    { label: 'Baseline volume (P-1)', value: formatLitres(dec(mechanics.baselineVolume)) },
    { label: 'Post scheme DIP (P+1)', value: formatLitres(dec(mechanics.postSchemeDip)) },
    { label: 'Incremental volume', value: formatLitres(dec(mechanics.incrementalVolume)) },
    { label: 'Incremental GP', value: formatMoney(dec(mechanics.incrementalGrossProfit)) },
    { label: 'Incremental profit', value: formatMoney(dec(mechanics.incrementalProfit)) },
    { label: 'ROI', value: formatPercent(roi), tone: tone(roi) },
    { label: 'Uplift', value: formatPercent(uplift), tone: tone(uplift) },
  ];
}

/** Criteria lists are cut at this many values until expanded; a region list can run to hundreds. */
export const CRITERION_PREVIEW = 12;

/** A criterion value as shown: its name, or its code when the name no longer resolves. */
export function valueLabel(value: { code: string; name: string }): string {
  return value.name || value.code;
}
