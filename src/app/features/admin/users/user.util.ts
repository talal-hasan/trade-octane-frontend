import { UserResponse } from '../../../core/api/admin.models';
import { StatusPillStatus } from '../../../shared/components/status-pill/status-pill.component';

// ─── Legacy menu ids ──────────────────────────────────────────────────────────
// The seven rows the Users screen absorbed. Named so call sites read as intent rather
// than as magic numbers, and so a menuId correction in menu-blueprint.ts has one obvious
// companion to update. See core/menu/menu-blueprint.ts for the full mapping.
export const MENU_CREATE_USER = 17;
export const MENU_CHANGE_USER_DETAILS = 20;
export const MENU_ASSIGN_ROLE = 136;
export const MENU_USER_REGION = 42;
export const MENU_USER_BRAND = 41;
export const MENU_ACCESS_CONTROL = 19;
export const MENU_RESIGNATION = 133;
export const MENU_ACCESS_BY_ROLE = 142;

/**
 * A user's state, collapsed to the one thing worth showing in a list.
 *
 * `UserResponse` reports four independent booleans — `isActive`, `isLocked`,
 * `mustChangePassword`, plus a `resignationDate`. Rendering four indicators per row would
 * be unreadable, so they collapse to the most actionable one. The order matters and is
 * the point:
 *
 *   resigned  the person has left. Nothing else about the account matters.
 *   inactive  cannot sign in at all, so a lock on top of it is irrelevant.
 *   locked    can sign in once an admin clears the lock — the actionable state.
 *   pending   provisioned, never used. Distinct from active for onboarding follow-up.
 *   active    normal.
 *
 * The detail screen shows the raw flags; a list needs one answer.
 */
export type UserRowStatus = 'resigned' | 'inactive' | 'locked' | 'pending' | 'active';

export function userStatusOf(user: UserResponse): UserRowStatus {
  if (user.resignationDate) {
    return 'resigned';
  }
  if (!user.isActive) {
    return 'inactive';
  }
  if (user.isLocked) {
    return 'locked';
  }
  // Never signed in: the account still carries its provisioning password.
  if (user.mustChangePassword && !user.passwordSetAtUtc) {
    return 'pending';
  }
  return 'active';
}

export const USER_STATUS_LABELS: Record<UserRowStatus, string> = {
  resigned: 'Resigned',
  inactive: 'Inactive',
  locked: 'Locked',
  pending: 'Pending first sign-in',
  active: 'Active',
};

/**
 * Maps to the shared status pill's vocabulary (CLAUDE.md §5 — subtle backgrounds, never
 * saturated fills). `locked` reads as overdue rather than rejected: it is a state an admin
 * clears, not a judgement on the account.
 */
export const USER_STATUS_PILL: Record<UserRowStatus, StatusPillStatus> = {
  resigned: 'rejected',
  inactive: 'draft',
  locked: 'overdue',
  pending: 'pending',
  active: 'approved',
};

/** Initials for the avatar chip. Falls back to the login name when there is no full name. */
export function initialsOf(user: Pick<UserResponse, 'fullName' | 'userId'>): string {
  const source = user.fullName?.trim() || user.userId;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
