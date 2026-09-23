import { HttpErrorResponse } from '@angular/common/http';

import { int } from '../../../core/api/api.types';
import {
  BudgetApprovalStage,
  BudgetCatalogueResponse,
  BudgetPeriodResponse,
  BudgetSchemeGroupResponse,
  BudgetSchemeTypeResponse,
  BudgetShellResponse,
} from '../../../core/api/master-data.models';
import { isRefusal, messageFor, serverDetail } from '../../../core/interceptors/error.interceptor';
import { ApprovalStep } from '../../../shared/components/approval-chain/approval-chain.component';
import { StatusPillStatus } from '../../../shared/components/status-pill/status-pill.component';

// Pure helpers for Create Budget: no Angular, no signals, so every rule the form shows can
// be tested on its own. The server applies the same rules on save; these exist so the form
// can say what will be refused *before* the click rather than after it.

/** Master Data → Edit Budget (`Edit_Budget.aspx`), where a returned budget is resubmitted. */
export const EDIT_BUDGET_MENU_ID = 43;

/** `BUDGET_SHELL.DESCRIPTION` is `nvarchar(1000)`. */
export const DESCRIPTION_MAX = 1000;

/**
 * The largest amount the form accepts. The column is `decimal(18,0)`, but a JavaScript number
 * is exact only up to 2^53 — far beyond any real budget, and the ceiling the other amount
 * fields in the app already use.
 */
export const AMOUNT_MAX = Number.MAX_SAFE_INTEGER;

// ─── Periods ──────────────────────────────────────────────────────────────────

export interface Period {
  year: number;
  month: number;
}

/** The window a budget's year and month must fall in: both ends included. */
export interface PeriodWindow {
  earliest: Period;
  latest: Period;
}

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toPeriod(wire: BudgetPeriodResponse | null | undefined): Period | null {
  if (!wire) {
    return null;
  }
  const year = int(wire.year);
  const month = int(wire.month);
  return year > 0 && month >= 1 && month <= 12 ? { year, month } : null;
}

/** Months since year 0 — so two periods compare as two numbers. */
export function periodIndex(period: Period): number {
  return period.year * 12 + (period.month - 1);
}

export function comparePeriods(a: Period, b: Period): number {
  return periodIndex(a) - periodIndex(b);
}

/** `Aug 2026`. */
export function periodLabel(period: Period | null | undefined): string {
  if (!period || period.month < 1 || period.month > 12) {
    return '';
  }
  return `${MONTH_ABBREVIATIONS[period.month - 1]} ${period.year}`;
}

export function monthAbbreviation(month: number): string {
  return MONTH_ABBREVIATIONS[month - 1] ?? '';
}

/**
 * Where a budget's year and month may fall: the current month through the catalogue's last
 * period. No back-dating from this screen, whatever the scheme type's own limit (legacy's
 * `Back_Dated_Months`) would allow. Null until the catalogue has loaded.
 */
export function periodWindow(catalogue: BudgetCatalogueResponse | null): PeriodWindow | null {
  const current = toPeriod(catalogue?.currentPeriod);
  const latest = toPeriod(catalogue?.latestPeriod);
  return current && latest ? { earliest: current, latest } : null;
}

export type PeriodState = 'open' | 'before' | 'after';

export function periodState(period: Period, window: PeriodWindow | null): PeriodState {
  if (!window) {
    return 'open';
  }
  if (comparePeriods(period, window.earliest) < 0) {
    return 'before';
  }
  return comparePeriods(period, window.latest) > 0 ? 'after' : 'open';
}

// ─── Scheme groups and types ──────────────────────────────────────────────────

export interface SchemeTypeMatch {
  group: BudgetSchemeGroupResponse;
  type: BudgetSchemeTypeResponse;
}

export function findSchemeType(
  catalogue: BudgetCatalogueResponse | null,
  schemeTypeId: number,
): SchemeTypeMatch | null {
  if (!catalogue || schemeTypeId <= 0) {
    return null;
  }
  for (const group of catalogue.schemeGroups) {
    const type = group.schemeTypes.find((candidate) => int(candidate.schemeTypeId) === schemeTypeId);
    if (type) {
      return { group, type };
    }
  }
  return null;
}

// ─── Region lines ─────────────────────────────────────────────────────────────

/**
 * A region line's description, derived from the shared one.
 *
 * Budgets raised for several regions at once almost always differ only in a region suffix —
 * "…_Aug_2026_KPK", "…_Aug_2026_Islamabad" — so with `suffix` on each line gets its region
 * appended. The line stays editable; once edited it keeps its own text.
 */
export function regionDescription(base: string, regionName: string, suffix: boolean): string {
  const trimmed = base.trim();
  if (!trimmed || !suffix || !regionName.trim()) {
    return trimmed;
  }
  return `${trimmed}_${regionName.trim()}`;
}

// ─── Approval stages ──────────────────────────────────────────────────────────

const STAGE_LEVEL: Partial<Record<BudgetApprovalStage, number>> = {
  AwaitingLevel1: 1,
  AwaitingLevel2: 2,
  AwaitingLevel3: 3,
};

/** The level a pending budget waits on — 0 when it waits on nobody. */
export function pendingLevel(stage: BudgetApprovalStage): number {
  return STAGE_LEVEL[stage] ?? 0;
}

export function stageLabel(stage: BudgetApprovalStage): string {
  switch (stage) {
    case 'Approved':
      return 'Approved';
    case 'AwaitingLevel1':
    case 'AwaitingLevel2':
    case 'AwaitingLevel3':
      return `Level ${pendingLevel(stage)} of 3`;
    case 'ReturnedToInitiator':
      return 'Returned to you';
    case 'NotRouted':
      return 'Never routed';
    default:
      return stage;
  }
}

export function stagePill(stage: BudgetApprovalStage): StatusPillStatus {
  switch (stage) {
    case 'Approved':
      return 'approved';
    case 'ReturnedToInitiator':
      return 'rejected';
    case 'NotRouted':
      return 'needs-attention';
    default:
      return 'pending';
  }
}

/**
 * The three-level chain for `to-approval-chain`: who signed and when, who holds it now, and
 * the levels not assigned yet (each level names the next when it signs). Empty for a budget
 * that waits on nobody — returned or never routed — which says so in words instead.
 */
export function approvalChainOf(shell: BudgetShellResponse): ApprovalStep[] {
  const stage = shell.stage;
  if (stage === 'ReturnedToInitiator' || stage === 'NotRouted') {
    return [];
  }
  const waitingOn = pendingLevel(stage);
  const steps: ApprovalStep[] = [];
  for (let level = 1; level <= 3; level++) {
    const step = shell.approvalSteps.find((candidate) => int(candidate.level) === level);
    const role = `Level ${level}${level === 3 ? ' · final' : ''}`;
    if (step?.approvedOn) {
      steps.push({ role, name: step.fullName || step.userId, status: 'approved', timestamp: step.approvedOn });
    } else if (step) {
      steps.push({ role, name: step.fullName || step.userId, status: level === waitingOn ? 'pending' : 'waiting' });
    } else {
      steps.push({ role, name: `Named when level ${level - 1} approves`, status: 'waiting' });
    }
  }
  return steps;
}

/** The index of the step waiting now, for `to-approval-chain`; past the end once approved. */
export function currentChainIndex(shell: BudgetShellResponse): number {
  const level = pendingLevel(shell.stage);
  return level > 0 ? level - 1 : 3;
}

/** Whole days since an ISO timestamp, or null when there is none. */
export function daysSince(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) {
    return null;
  }
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 86_400_000));
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

/** `07 Mar 2024`, or an em dash for a missing or unreadable value. */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

// ─── Refusals ─────────────────────────────────────────────────────────────────

/** The form field a refusal is about, so the form can point at it. */
export type BudgetField = 'period' | 'region' | 'value' | 'schemeType' | 'forwardTo' | 'amount' | 'description';

export interface BudgetRefusal {
  /** The API's `errorCode` without its `master_data.budgets.` prefix; empty when there is none. */
  code: string;
  message: string;
  field: BudgetField | null;
  /**
   * True when the refusal is about this region's line alone, so the other regions in the
   * batch can still be saved. Anything shared — the period, the product, the scheme, the
   * approver — would be refused the same way for every region, so the batch stops.
   */
  lineOnly: boolean;
  /** The server's answer to a double submit: the shell that already exists. */
  existingShellCode: string | null;
  /** A fault rather than a refusal — the error interceptor has already shown it as a toast. */
  toasted: boolean;
}

const FIELD_OF: Readonly<Record<string, BudgetField>> = {
  back_dated: 'period',
  year_too_late: 'period',
  month_out_of_range: 'period',
  unknown_region: 'region',
  region_inactive: 'region',
  unknown_criterion: 'value',
  value_not_available: 'value',
  unknown_scheme_type: 'schemeType',
  scheme_type_inactive: 'schemeType',
  scheme_group_not_permitted: 'schemeType',
  unknown_approver: 'forwardTo',
  approver_not_eligible: 'forwardTo',
  amount_out_of_range: 'amount',
  description_too_long: 'description',
};

const LINE_ONLY_FIELDS: ReadonlySet<BudgetField> = new Set<BudgetField>(['region', 'amount', 'description']);

/** Reads a failed create into something the form can act on. */
export function refusalOf(error: unknown): BudgetRefusal {
  if (!(error instanceof HttpErrorResponse)) {
    return {
      code: '',
      message: 'The budget could not be saved.',
      field: null,
      lineOnly: false,
      existingShellCode: null,
      toasted: false,
    };
  }
  const body = error.error as Record<string, unknown> | null;
  const rawCode = body && typeof body === 'object' && typeof body['errorCode'] === 'string' ? body['errorCode'] : '';
  const code = rawCode.replace(/^master_data\.budgets\./, '');
  const message = serverDetail(error.error) ?? messageFor(error);
  const field = FIELD_OF[code] ?? null;
  const existingShellCode = code === 'duplicate_submit' ? shellCodeIn(message) : null;
  return {
    code,
    message,
    field,
    lineOnly: code === 'duplicate_submit' || (field !== null && LINE_ONLY_FIELDS.has(field)),
    existingShellCode,
    toasted: !isRefusal(error),
  };
}

/** "Budget Shell 05-39896-28/2026-8 was just created…" → `05-39896-28/2026-8`. */
export function shellCodeIn(message: string): string | null {
  const match = /Budget Shell (\S+) was just created/i.exec(message);
  return match ? match[1] : null;
}

// ─── Per-user preferences ─────────────────────────────────────────────────────
// Conveniences only — the last criterion and the last approver per scheme group, so the
// next budget starts where the last one ended. Storage can be blocked or cleared; every
// read and write tolerates that.

const PREFERENCE_PREFIX = 'to.masterData.budget';

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
