import { HttpErrorResponse } from '@angular/common/http';

import { int } from '../../../core/api/api.types';
import {
  ApproveBudgetCatalogueResponse,
  ApproveBudgetDecisionItemResponse,
  ApproveBudgetOutcome,
  ApproveBudgetResponse,
  ApproveNotificationState,
  ApproveUserResponse,
} from '../../../core/api/approve.models';
import { isRefusal, messageFor, serverDetail } from '../../../core/interceptors/error.interceptor';
import { ApprovalStep } from '../../../shared/components/approval-chain/approval-chain.component';
import { StatusPillStatus } from '../../../shared/components/status-pill/status-pill.component';

// Pure helpers for Approve → Budgets: no Angular, no signals, so every rule the screen states
// before a click can be tested on its own. The server checks the same rules on submit; these
// exist so the panel can say what will happen, and what would be refused, beforehand.

/** Levels 1 and 2 forward to the next approver; level 3 is the final sign-off. */
export const FINAL_LEVEL = 3;

/** `Approve:MaxBatchSize` — the most budgets one accept or reject may act on. */
export const MAX_BATCH = 200;

// ─── Rows ─────────────────────────────────────────────────────────────────────

/** One pending budget, read once from the wire into the numbers and text the grid uses. */
export interface BudgetRow {
  shellCode: string;
  year: number;
  month: number;
  /** `Sep 2026`. */
  period: string;
  regionName: string;
  dimension: string;
  /** The business, category, brand or SKU name; the code when it no longer resolves. */
  product: string;
  schemeType: string;
  schemeGroup: string;
  schemeGroupKey: string;
  description: string;
  amount: number;
  originalAmount: number;
  level: number;
  isFinal: boolean;
  waitingSince: string | null;
  /** Whole days since it reached the caller; null when the server does not know. */
  waitingDays: number | null;
  initiatedBy: ApproveUserResponse | null;
  initiatedOn: string | null;
  steps: { level: number; userId: string; fullName: string; approvedOn: string | null }[];
  /** Shell code and description, lower-cased — what the server's search looks at. */
  searchText: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function toRow(wire: ApproveBudgetResponse, now = new Date()): BudgetRow {
  const year = int(wire.year);
  const month = int(wire.month);
  const level = int(wire.level);
  const waitingSince = wire.waitingSince ?? null;
  return {
    shellCode: wire.shellCode,
    year,
    month,
    period: month >= 1 && month <= 12 ? `${MONTHS[month - 1]} ${year}` : String(year),
    regionName: wire.regionName || wire.regionCode,
    dimension: wire.dimension || wire.criterion,
    product: wire.valueName || wire.value,
    schemeType: wire.schemeType,
    schemeGroup: wire.schemeGroup,
    schemeGroupKey: wire.schemeGroupKey,
    description: wire.description,
    amount: int(wire.amount),
    originalAmount: int(wire.originalAmount),
    level,
    isFinal: wire.isFinal || level >= FINAL_LEVEL,
    waitingSince,
    waitingDays: daysSince(waitingSince, now),
    initiatedBy: wire.initiatedBy ?? null,
    initiatedOn: wire.initiatedOn ?? null,
    steps: wire.approvalSteps.map((step) => ({
      level: int(step.level),
      userId: step.userId,
      fullName: step.fullName,
      approvedOn: step.approvedOn ?? null,
    })),
    searchText: `${wire.shellCode} ${wire.description}`.toLowerCase(),
  };
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

/** `Today`, `1 day`, `12 days`; an em dash when unknown. */
export function waitingLabel(days: number | null): string {
  if (days === null) {
    return '—';
  }
  if (days === 0) {
    return 'Today';
  }
  return days === 1 ? '1 day' : `${days} days`;
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

export function levelLabel(level: number): string {
  return level >= FINAL_LEVEL ? `Level ${level} · final` : `Level ${level} of ${FINAL_LEVEL}`;
}

// ─── Filtering and sorting ────────────────────────────────────────────────────

export interface RowFilter {
  /** A `schemeGroupKey`; null for every budget type. */
  typeKey: string | null;
  level: number | null;
  search: string;
}

/**
 * The server's own search rule — anywhere in the shell code or the description — so what the
 * grid shows is exactly what Send to Excel downloads with the same filters.
 */
export function matchesSearch(row: BudgetRow, search: string): boolean {
  const term = search.trim().toLowerCase();
  return term.length === 0 || row.searchText.includes(term);
}

export function filterRows(rows: readonly BudgetRow[], filter: RowFilter): BudgetRow[] {
  return rows.filter(
    (row) =>
      (filter.typeKey === null || row.schemeGroupKey === filter.typeKey) &&
      (filter.level === null || row.level === filter.level) &&
      matchesSearch(row, filter.search),
  );
}

export type SortKey = 'waiting' | 'amount' | 'period';

export interface RowSort {
  key: SortKey;
  /** `waiting` descending is longest waiting first — the server's queue order. */
  descending: boolean;
}

export const QUEUE_ORDER: RowSort = { key: 'waiting', descending: true };

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function waitingValue(row: BudgetRow): number {
  if (!row.waitingSince) {
    return Number.NEGATIVE_INFINITY;
  }
  const time = new Date(row.waitingSince).getTime();
  // Older first when descending: a smaller timestamp has waited longer.
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : -time;
}

/** Stable: rows that tie keep the server's order. The shell code breaks remaining ties. */
export function sortRows(rows: readonly BudgetRow[], sort: RowSort): BudgetRow[] {
  const direction = sort.descending ? -1 : 1;
  const value = (row: BudgetRow): number => {
    switch (sort.key) {
      case 'amount':
        return row.amount;
      case 'period':
        return row.year * 12 + row.month;
      default:
        return waitingValue(row);
    }
  };
  return rows
    .map((row, index) => ({ row, index, value: value(row) }))
    .sort((a, b) => {
      if (a.value !== b.value) {
        return a.value < b.value ? -direction : direction;
      }
      return a.index - b.index || COLLATOR.compare(a.row.shellCode, b.row.shellCode);
    })
    .map((entry) => entry.row);
}

// ─── The decision ─────────────────────────────────────────────────────────────

/** One Forward To choice for the current selection. */
export interface ForwardOption {
  userId: string;
  fullName: string;
  /** Why this person cannot take the selection, or null when they can. */
  disabledReason: string | null;
}

/** A budget type and level among the selection that has nobody to forward to. */
export interface UnroutedLevel {
  typeName: string;
  level: number;
}

/** What Accept would do with the current selection, worked out before the click. */
export interface ForwardPlan {
  /** Selected budgets at level 1 or 2: signed and forwarded. */
  forwarding: BudgetRow[];
  /** Selected budgets at level 3: signed, which approves them. */
  finals: BudgetRow[];
  /**
   * Who may receive every forwarding budget: on the catalogue's Forward To list of each
   * budget's type and level. Someone who raised one of them is listed but disabled.
   */
  options: ForwardOption[];
  /** Types and levels among the selection whose Forward To list is empty. */
  unrouted: UnroutedLevel[];
  /**
   * True when every forwarding type and level has approvers, but nobody is on all of them —
   * the selection spans budget types that go to different people.
   */
  noCommonApprover: boolean;
}

export function planForward(
  selected: readonly BudgetRow[],
  catalogue: ApproveBudgetCatalogueResponse | null,
): ForwardPlan {
  const forwarding = selected.filter((row) => !row.isFinal);
  const finals = selected.filter((row) => row.isFinal);
  if (forwarding.length === 0) {
    return { forwarding, finals, options: [], unrouted: [], noCommonApprover: false };
  }

  const lists: ApproveUserResponse[][] = [];
  const unrouted: UnroutedLevel[] = [];
  const seen = new Set<string>();
  for (const row of forwarding) {
    const key = `${row.schemeGroupKey}|${row.level}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const type = catalogue?.budgetTypes.find((candidate) => candidate.schemeGroupKey === row.schemeGroupKey);
    const level = type?.levels.find((candidate) => int(candidate.level) === row.level);
    const list = level?.forwardTo ?? [];
    if (list.length === 0) {
      unrouted.push({ typeName: type?.name || row.schemeGroup || row.schemeGroupKey, level: row.level });
    }
    lists.push(list);
  }

  let common = lists[0] ?? [];
  for (const list of lists.slice(1)) {
    const ids = new Set(list.map((user) => user.userId));
    common = common.filter((user) => ids.has(user.userId));
  }

  // The server refuses an initiator as the approver of their own budget.
  const raisedBy = new Map<string, number>();
  for (const row of forwarding) {
    if (row.initiatedBy) {
      raisedBy.set(row.initiatedBy.userId, (raisedBy.get(row.initiatedBy.userId) ?? 0) + 1);
    }
  }

  const options = common.map((user) => {
    const raised = raisedBy.get(user.userId) ?? 0;
    return {
      userId: user.userId,
      fullName: user.fullName || user.userId,
      disabledReason:
        raised === 0
          ? null
          : raised === forwarding.length && raised === 1
            ? 'Raised this budget'
            : `Raised ${raised} of these budgets`,
    };
  });

  return {
    forwarding,
    finals,
    options,
    unrouted,
    noCommonApprover: unrouted.length === 0 && options.length === 0,
  };
}

/** Who a rejection goes back to, most budgets first: `Nada Ahmad` ×2. */
export function rejectRecipients(selected: readonly BudgetRow[]): { name: string; count: number }[] {
  const byInitiator = new Map<string, { name: string; count: number }>();
  for (const row of selected) {
    const id = row.initiatedBy?.userId ?? '';
    const name = row.initiatedBy?.fullName || row.initiatedBy?.userId || 'Unknown initiator';
    const entry = byInitiator.get(id) ?? { name, count: 0 };
    entry.count++;
    byInitiator.set(id, entry);
  }
  return [...byInitiator.values()].sort((a, b) => b.count - a.count || COLLATOR.compare(a.name, b.name));
}

// ─── The approval chain ───────────────────────────────────────────────────────

/**
 * The chain for `to-approval-chain`: who raised the budget, the levels already signed, the
 * caller's own level (current), and the levels not assigned yet — each level names the next
 * when it signs.
 */
export function approvalChainOf(row: BudgetRow): ApprovalStep[] {
  const steps: ApprovalStep[] = [
    {
      role: 'Raised',
      name: row.initiatedBy?.fullName || row.initiatedBy?.userId || 'Unknown initiator',
      status: 'approved',
      timestamp: row.initiatedOn ?? undefined,
    },
  ];
  for (let level = 1; level <= FINAL_LEVEL; level++) {
    const step = row.steps.find((candidate) => candidate.level === level);
    const role = `Level ${level}${level === FINAL_LEVEL ? ' · final' : ''}`;
    if (step?.approvedOn && level !== row.level) {
      steps.push({ role, name: step.fullName || step.userId, status: 'approved', timestamp: step.approvedOn });
    } else if (step) {
      steps.push({ role, name: step.fullName || step.userId, status: level === row.level ? 'pending' : 'waiting' });
    } else {
      steps.push({ role, name: `Named when level ${level - 1} approves`, status: 'waiting' });
    }
  }
  return steps;
}

/** The caller's step in {@link approvalChainOf}: the first step is the initiator. */
export function currentChainIndex(row: BudgetRow): number {
  return row.level;
}

// ─── Outcomes ─────────────────────────────────────────────────────────────────

export function outcomeLabel(outcome: ApproveBudgetOutcome): string {
  switch (outcome) {
    case 'Forwarded':
      return 'Forwarded';
    case 'Approved':
      return 'Approved';
    case 'Rejected':
      return 'Returned';
    case 'NotPending':
      return 'Already decided';
    case 'NotFound':
      return 'Not found';
    default:
      return outcome;
  }
}

export function outcomePill(outcome: ApproveBudgetOutcome): StatusPillStatus {
  switch (outcome) {
    case 'Approved':
      return 'approved';
    case 'Forwarded':
      return 'pending';
    case 'Rejected':
      return 'rejected';
    default:
      return 'needs-attention';
  }
}

/** One line of what an outcome meant for the person told about it. */
export function outcomeNote(item: ApproveBudgetDecisionItemResponse): string {
  const name = item.notifiedUser?.fullName || item.notifiedUser?.userId || '';
  switch (item.outcome) {
    case 'Forwarded':
      return `To ${name || 'the next approver'} at level ${int(item.level) + 1}. ${emailNote(item.notification)}`;
    case 'Approved':
      return 'Final approval — the budget is approved.';
    case 'Rejected':
      return `Back to ${name || 'its initiator'}. ${emailNote(item.notification)}`;
    case 'NotPending':
      return 'No longer waiting on you — decided or re-routed elsewhere. Nothing was changed.';
    case 'NotFound':
      return 'No budget has this shell code any more. Nothing was changed.';
    default:
      return '';
  }
}

export function emailNote(state: ApproveNotificationState): string {
  switch (state) {
    case 'Queued':
      return 'Emailed.';
    case 'Disabled':
      return 'Email is switched off on this server.';
    case 'NoEmailAddress':
      return 'Not emailed: no email address on file.';
    case 'QueueFull':
      return 'Not emailed: the mail queue was full.';
    default:
      return '';
  }
}

// ─── Refusals ─────────────────────────────────────────────────────────────────

/** What the panel points a refusal at. */
export type RefusalTarget = 'forwardTo' | 'selection' | null;

export interface DecisionRefusal {
  /** The API's `errorCode` without its `approve.budgets.` prefix; empty when there is none. */
  code: string;
  message: string;
  target: RefusalTarget;
  /** A Forward To refusal: the list the panel offered may be out of date. */
  staleForwardTo: boolean;
  /** Someone else held the budgets; nothing was written and the same request may be retried. */
  retryable: boolean;
  /** A fault rather than a refusal — the error interceptor has already shown it as a toast. */
  toasted: boolean;
}

const TARGET_OF: Readonly<Record<string, RefusalTarget>> = {
  forward_to_required: 'forwardTo',
  forward_to_too_long: 'forwardTo',
  unknown_forward_to: 'forwardTo',
  forward_to_not_eligible: 'forwardTo',
  no_budgets: 'selection',
  too_many_budgets: 'selection',
  shell_code_too_long: 'selection',
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
  const code = rawCode.replace(/^approve\.budgets\./, '');
  return {
    code,
    message: serverDetail(error.error) ?? messageFor(error),
    target: TARGET_OF[code] ?? null,
    staleForwardTo: code === 'unknown_forward_to' || code === 'forward_to_not_eligible',
    retryable: code === 'busy' || error.status === 409,
    toasted: !isRefusal(error),
  };
}

// ─── Per-user preferences ─────────────────────────────────────────────────────
// A convenience only: the last Forward To per budget type and level, so the next batch starts
// where the last one ended. Storage can be blocked or cleared; every read and write tolerates it.

const PREFERENCE_PREFIX = 'to.approve.budgets';

export function forwardPreferenceKey(schemeGroupKey: string, level: number): string {
  return `forwardTo.${schemeGroupKey}.${level}`;
}

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

/**
 * The Forward To to start from: the only person who can take the selection, else the one
 * last chosen for its types and levels, else nobody.
 */
export function defaultForwardTo(plan: ForwardPlan, remembered: readonly string[]): string {
  const open = plan.options.filter((option) => option.disabledReason === null);
  if (open.length === 1) {
    return open[0].userId;
  }
  for (const userId of remembered) {
    if (userId && open.some((option) => option.userId === userId)) {
      return userId;
    }
  }
  return '';
}
