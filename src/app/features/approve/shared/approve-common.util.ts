import { ApproveNotificationState } from '../../../core/api/approve.models';

// Helpers every Approve screen shares: pure, no Angular, so each screen's own util can build on
// them and be tested on its own.

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

/** What happened to the email a decision sends, in a few words. */
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

// ─── Per-user preferences ─────────────────────────────────────────────────────
// Conveniences only, such as the last Forward To, so the next batch starts where the last one
// ended. Storage can be blocked or cleared; every read and write tolerates it.

export function readScreenPreference(screen: string, userId: string, key: string): string {
  try {
    return localStorage.getItem(`to.approve.${screen}.${userId}.${key}`) ?? '';
  } catch {
    return '';
  }
}

export function writeScreenPreference(screen: string, userId: string, key: string, value: string): void {
  try {
    localStorage.setItem(`to.approve.${screen}.${userId}.${key}`, value);
  } catch {
    // Storage is full or blocked: the preference is simply not remembered.
  }
}
