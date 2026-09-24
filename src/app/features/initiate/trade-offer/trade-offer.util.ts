import { HttpErrorResponse } from '@angular/common/http';

import { dec, int } from '../../../core/api/api.types';
import {
  TradeOfferCatalogueResponse,
  TradeOfferCriterionSelection,
  TradeOfferOption,
  TradeOfferNotificationState,
  TradeOfferScheme,
  TradeOfferSchemeStatus,
  TradeOfferSlab,
} from '../../../core/api/initiate.models';
import { isRefusal, messageFor, serverDetail } from '../../../core/interceptors/error.interceptor';
import { ApprovalStep } from '../../../shared/components/approval-chain/approval-chain.component';
import { StatusPillStatus } from '../../../shared/components/status-pill/status-pill.component';

// Pure helpers for Trade Offer - in Litres: no Angular, no signals, so every rule the screen
// shows before a save can be tested on its own. The server applies the same rules again.

// ─── Criteria the screen has rules about ──────────────────────────────────────
// `SCHEME_CRITERIA.TABLENAME` values; compared case-insensitively, as the column's collation is.

export const CRITERION = {
  region: 'GEO_LEVEL6',
  distributor: 'DISTRIBUTOR',
  pop: 'POP',
  perfectStore: 'Perfect_Store_Level',
  brand: 'PROD_LEVEL6',
  masterSku: 'MASTER_SKU',
} as const;

/** `memory_variable_Detail.Value` is `varchar(4000)`; codes are joined with `~~`. */
export const CRITERION_VALUE_LENGTH = 4000;
const VALUE_SEPARATOR = '~~';

/** Litres and forecasts: 8 digits before the decimal point, 4 after. */
export const QUANTITY_MAX = 99_999_999.9999;
/** Discount value and For Every: `numeric(18,6)`, 12 digits before the point (a double holds 2 after). */
export const SIX_PLACE_MAX = 999_999_999_999.99;

export function sameCriterion(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function findCriterion(
  criteria: readonly TradeOfferCriterionSelection[],
  criterion: string,
): TradeOfferCriterionSelection | null {
  return criteria.find((candidate) => sameCriterion(candidate.criterion, criterion)) ?? null;
}

/** The length of a criterion's codes as stored: joined with `~~`. */
export function joinedLength(codes: readonly string[]): number {
  if (codes.length === 0) {
    return 0;
  }
  return codes.reduce((sum, code) => sum + code.length, 0) + VALUE_SEPARATOR.length * (codes.length - 1);
}

/** The criteria rules "Check for Approval" applies, read from what is saved. */
export interface CriteriaRequirements {
  regionCount: number;
  masterSkuCount: number;
  hasBrand: boolean;
  /** Exactly one region. */
  regionOk: boolean;
  /** At least one master SKU. */
  masterSkuOk: boolean;
  /** No brand criterion at all. */
  brandOk: boolean;
  /** The region code, when there is exactly one — the budget shell must be of it. */
  regionCode: string | null;
}

export function criteriaRequirements(criteria: readonly TradeOfferCriterionSelection[]): CriteriaRequirements {
  const region = findCriterion(criteria, CRITERION.region);
  const masterSku = findCriterion(criteria, CRITERION.masterSku);
  const regionCount = region?.values.length ?? 0;
  const masterSkuCount = masterSku?.values.length ?? 0;
  const hasBrand = !!findCriterion(criteria, CRITERION.brand);
  return {
    regionCount,
    masterSkuCount,
    hasBrand,
    regionOk: regionCount === 1,
    masterSkuOk: masterSkuCount > 0,
    brandOk: !hasBrand,
    regionCode: regionCount === 1 ? region!.values[0].code : null,
  };
}

// ─── Dates ────────────────────────────────────────────────────────────────────
// Wire dates are `yyyy-MM-dd` (DateOnly). They are read and written as *local* calendar
// dates: `new Date('2026-08-10')` would be UTC midnight, the previous evening west of it.

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * The two ranges most schemes use: from today to the month's end (90% of schemes since 2025
 * end on the last day of a month), and the whole of next month.
 */
export function periodPresets(today: Date): { label: string; range: DateRange }[] {
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return [
    { label: 'Rest of this month', range: { from: startOfDay(today), to: endOfMonth(today) } },
    { label: `All of ${MONTH_NAMES[nextMonth.getMonth()]}`, range: { from: nextMonth, to: endOfMonth(nextMonth) } },
  ];
}

/**
 * The To Date that follows a new From Date: kept while it is still in the same month and not
 * before it, otherwise the month's last day.
 */
export function followingToDate(from: Date, to: Date | null): Date {
  if (to && sameMonth(from, to) && to.getTime() >= from.getTime()) {
    return to;
  }
  return endOfMonth(from);
}

const MONTH_NAMES = [
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
];

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `10 Aug 2026`, or an em dash. */
export function formatDate(value: Date | string | null | undefined): string {
  const date = typeof value === 'string' ? (parseIsoDate(value) ?? new Date(value)) : value;
  return date && !Number.isNaN(date.getTime()) ? DATE_FORMAT.format(date) : '—';
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_TIME_FORMAT.format(date);
}

/** `10 – 31 Aug 2026`: the month once, since a scheme never spans two. */
export function formatPeriod(from: string | null | undefined, to: string | null | undefined): string {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end) {
    return start ? formatDate(start) : '—';
  }
  if (sameMonth(start, end)) {
    return `${String(start.getDate()).padStart(2, '0')} – ${DATE_FORMAT.format(end)}`;
  }
  return `${DATE_FORMAT.format(start)} – ${DATE_FORMAT.format(end)}`;
}

/** Whole days in the range, both ends included. */
export function daysIn(range: DateRange): number {
  return Math.round((startOfDay(range.to).getTime() - startOfDay(range.from).getTime()) / 86_400_000) + 1;
}

// ─── Slab ─────────────────────────────────────────────────────────────────────

export interface SlabValues {
  fromQuantity: number;
  toQuantity: number;
  discountValue: number;
  forecastLimit: number;
  forEvery: number;
}

export function slabValues(slab: TradeOfferSlab | null | undefined): SlabValues | null {
  if (!slab) {
    return null;
  }
  return {
    fromQuantity: dec(slab.fromQuantity),
    toQuantity: dec(slab.toQuantity),
    discountValue: dec(slab.discountValue),
    forecastLimit: dec(slab.forecastLimit),
    forEvery: dec(slab.forEvery),
  };
}

/** Rounds as `numeric(18,2)` stores: 2 places, half away from zero. */
export function round2(value: number): number {
  const scaled = Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
  return value < 0 ? -scaled : scaled;
}

/**
 * The total discount a slab gives — "Get Total Discount": discount ÷ For Every × forecast.
 * Null while any of the three is missing, or For Every is not above 0.
 */
export function slabTotalDiscount(
  discountValue: number | null | undefined,
  forEvery: number | null | undefined,
  forecastLimit: number | null | undefined,
): number | null {
  if (discountValue == null || forEvery == null || forecastLimit == null || forEvery <= 0) {
    return null;
  }
  return round2((discountValue / forEvery) * forecastLimit);
}

/**
 * Whether the saved mechanics still match the slab — the server's own test for
 * `mechanics_outdated`: the saved total discount and activated volume against the slab's.
 */
export function mechanicsOutdated(scheme: TradeOfferScheme): boolean {
  const mechanics = scheme.mechanics;
  const slab = slabValues(scheme.slabs[0]);
  if (!mechanics || !slab) {
    return false;
  }
  const total = slabTotalDiscount(slab.discountValue, slab.forEvery, slab.forecastLimit) ?? 0;
  return (
    round2(dec(mechanics.figures.totalDiscount)) !== total ||
    round2(dec(mechanics.figures.activatedVolume)) !== round2(slab.forecastLimit)
  );
}

// ─── Posted to ────────────────────────────────────────────────────────────────

/** The system schemes will be posted to once Salesflo is replaced. */
export const IBY = 'IBY';

export interface DatabaseChoice {
  code: string;
  name: string;
  disabled: boolean;
  /** Why it cannot be picked. */
  note: string;
}

/**
 * The Posted To dropdown. `listed` is false while the server names only its default: the choice
 * is then that default, with IBY shown but not pickable, and nothing is sent on save.
 *
 * A code the scheme was saved with that is no longer offered (legacy's ORANGE, `0`, on 41,603
 * older schemes) is kept in the list, disabled, so the dropdown never shows blank for it.
 */
export function databaseChoices(
  catalogue: TradeOfferCatalogueResponse | null,
  saved: TradeOfferOption | null | undefined,
): { choices: DatabaseChoice[]; listed: boolean; defaultCode: string } {
  const fallback = catalogue?.database ?? { code: '1', name: 'Salesflo' };
  const offered = catalogue?.databases ?? [];
  const listed = offered.length > 0;
  const choices: DatabaseChoice[] = listed
    ? offered.map((database) => ({
        code: database.code,
        name: database.name || database.code,
        disabled: !database.isAvailable,
        note: database.isAvailable ? '' : 'Not in use yet',
      }))
    : [
        { code: fallback.code, name: fallback.name || fallback.code, disabled: false, note: '' },
        { code: IBY, name: IBY, disabled: true, note: 'Not in use yet' },
      ];
  if (saved?.code && !choices.some((choice) => choice.code === saved.code)) {
    choices.push({ code: saved.code, name: saved.name || saved.code, disabled: true, note: 'No longer offered' });
  }
  return { choices, listed, defaultCode: fallback.code };
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function statusLabel(status: TradeOfferSchemeStatus): string {
  switch (status) {
    case 'Draft':
      return 'Draft';
    case 'ReturnedByApprover':
      return 'Returned to you';
    case 'SentForApproval':
      return 'Sent for approval';
    case 'Expired':
      return 'Expired';
    default:
      return status;
  }
}

export function statusPill(status: TradeOfferSchemeStatus): StatusPillStatus {
  switch (status) {
    case 'ReturnedByApprover':
      return 'rejected';
    case 'SentForApproval':
      return 'pending';
    case 'Expired':
      return 'overdue';
    default:
      return 'draft';
  }
}

/** The three levels for `to-approval-chain`: who signed, who holds it now, who is named next. */
export function approvalChainOf(scheme: TradeOfferScheme): { steps: ApprovalStep[]; current: number } {
  const steps: ApprovalStep[] = [];
  let current = -1;
  for (let level = 1; level <= 3; level++) {
    const step = scheme.approvalSteps.find((candidate) => int(candidate.level) === level);
    const role = `Level ${level}${level === 3 ? ' · final' : ''}`;
    if (step?.approvedOn) {
      steps.push({ role, name: step.fullName || step.userId, status: 'approved', timestamp: step.approvedOn });
    } else if (step) {
      // The first level still unsigned is the one holding the scheme.
      if (current < 0) {
        current = level - 1;
      }
      steps.push({ role, name: step.fullName || step.userId, status: current === level - 1 ? 'pending' : 'waiting' });
    } else {
      const name = level === 1 ? 'Named when the scheme is sent' : `Named when level ${level - 1} approves`;
      steps.push({ role, name, status: 'waiting' });
    }
  }
  return { steps, current: current < 0 ? 3 : current };
}

export function notificationNote(state: TradeOfferNotificationState | null, approver: string): string {
  switch (state) {
    case 'Queued':
      return `${approver} is being emailed.`;
    case 'Disabled':
      return `Email is switched off on this server, so let ${approver} know.`;
    case 'NoEmailAddress':
      return `${approver} has no email address on file, so let them know.`;
    case 'QueueFull':
      return `The email to ${approver} could not be queued, so let them know.`;
    default:
      return '';
  }
}

// ─── Steps and the issues that point at them ──────────────────────────────────

export type TradeOfferStep = 'setup' | 'slab' | 'criteria' | 'mechanics' | 'approval';

export const STEP_LABELS: Readonly<Record<TradeOfferStep, string>> = {
  setup: 'Setup',
  slab: 'Slab',
  criteria: 'Criteria',
  mechanics: 'Discount mechanics',
  approval: 'Approval route',
};

const ISSUE_STEP: Readonly<Record<string, TradeOfferStep>> = {
  date_selection_incorrect: 'setup',
  discount_exceeds_budget: 'mechanics',
  region_required: 'criteria',
  single_region: 'criteria',
  master_sku_required: 'criteria',
  brand_not_allowed: 'criteria',
  slabs_required: 'slab',
  mechanics_required: 'mechanics',
  criteria_too_long: 'criteria',
  shell_region_mismatch: 'mechanics',
  shell_not_available: 'mechanics',
  mechanics_outdated: 'mechanics',
};

/** Where to fix an issue "Check for Approval" raised; null for one only an administrator can fix. */
export function stepOfIssue(code: string): TradeOfferStep | null {
  return ISSUE_STEP[code.replace(/^initiate\.trade_offers\./, '')] ?? null;
}

// ─── Refusals ─────────────────────────────────────────────────────────────────

export interface TradeOfferRefusal {
  /** The API's `errorCode` without its `initiate.trade_offers.` prefix; empty when there is none. */
  code: string;
  message: string;
  status: number;
  /** A fault rather than a refusal — the error interceptor has already toasted it. */
  toasted: boolean;
}

export function refusalOf(error: unknown, fallback = 'That could not be saved.'): TradeOfferRefusal {
  if (!(error instanceof HttpErrorResponse)) {
    return { code: '', message: fallback, status: 0, toasted: false };
  }
  const body = error.error as Record<string, unknown> | null;
  const raw = body && typeof body === 'object' && typeof body['errorCode'] === 'string' ? body['errorCode'] : '';
  return {
    code: raw.replace(/^initiate\.trade_offers\./, ''),
    message: serverDetail(error.error) ?? messageFor(error),
    status: error.status,
    toasted: !isRefusal(error),
  };
}

/** Refusals meaning the scheme changed state elsewhere, so the screen should read it again. */
export function isStaleScheme(refusal: TradeOfferRefusal): boolean {
  return refusal.code === 'sent_for_approval' || refusal.code === 'expired' || refusal.code === 'scheme_not_found';
}

/** "New Scheme is added with Sequence ID = 183578 moments ago…" → `183578`. */
export function sequenceIdIn(message: string): string | null {
  const match = /Sequence ID = (\S+?) moments ago/i.exec(message);
  return match ? match[1] : null;
}

// ─── Per-user preferences ─────────────────────────────────────────────────────
// Conveniences only: the last claim type and the last Forward To. Storage can be blocked
// or cleared; every read and write tolerates that.

const PREFERENCE_PREFIX = 'to.initiate.tradeOffer';

export function readPreference(userId: string, key: string): string {
  try {
    return localStorage.getItem(`${PREFERENCE_PREFIX}.${userId}.${key}`) ?? '';
  } catch {
    return '';
  }
}

export function writePreference(userId: string, key: string, value: string): void {
  try {
    localStorage.setItem(`${PREFERENCE_PREFIX}.${userId}.${key}`, value);
  } catch {
    // Storage is full or blocked: the preference is simply not remembered.
  }
}

// ─── Numbers ──────────────────────────────────────────────────────────────────

const LITRES = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 4 });
const AMOUNT = new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PLAIN = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 6 });

/** `4,142.4 L`. */
export function formatLitres(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : `${LITRES.format(value)} L`;
}

/** `20,712.00` — figures stored to 2 places. */
export function formatAmount(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : AMOUNT.format(value);
}

/**
 * `PKR 20,712`, or `PKR 20,712.40` when there are paise. Amounts here are computed to 2 places,
 * and rounding them away could hide the fraction by which a discount exceeds a budget.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  const rounded = round2(value);
  return `PKR ${Number.isInteger(rounded) ? LITRES.format(rounded) : AMOUNT.format(rounded)}`;
}

export function formatPlain(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? '—' : PLAIN.format(value);
}
