import {
  DistributorAccountResponse,
  DistributorCandidateResponse,
} from '../../../core/api/admin2.models';
import { StatusPillStatus } from '../../../shared/components/status-pill/status-pill.component';

/** Legacy "Create Distributor" — `CPS_CreateDistributor.aspx`, under Administration 2.0 (92). */
export const MENU_CREATE_DISTRIBUTOR = 87;

export const DISTRIBUTORS_ROUTE = '/admin2/distributors';

/**
 * An account's sign-in state. The order is the point:
 *
 *   inactive  cannot sign in at all, so a lock on top of it changes nothing
 *   locked    refused at SSO sign-in until someone unlocks it
 *   active    normal
 */
export type DistributorRowStatus = 'inactive' | 'locked' | 'active';

export function distributorStatusOf(account: DistributorAccountResponse): DistributorRowStatus {
  if (!account.isActive) {
    return 'inactive';
  }
  return account.isLocked ? 'locked' : 'active';
}

export const DISTRIBUTOR_STATUS_LABELS: Record<DistributorRowStatus, string> = {
  inactive: 'Inactive',
  locked: 'Locked',
  active: 'Active',
};

/** The user directory's vocabulary, so the same state reads the same on both screens. */
export const DISTRIBUTOR_STATUS_PILL: Record<DistributorRowStatus, StatusPillStatus> = {
  inactive: 'draft',
  locked: 'overdue',
  active: 'approved',
};

/** Request member names, as `changedFields` reports them, in words. */
export const DISTRIBUTOR_FIELD_LABELS: Readonly<Record<string, string>> = {
  businessTypeId: 'Business type',
  regionCode: 'Region',
  areaCode: 'Area',
  territoryCode: 'Territory',
  city: 'City',
  contact: 'Contact',
  distributorEmail: 'Distributor email',
  kpoEmail: 'KPO email',
  password: 'Password',
  isActive: 'Active',
  isDeleted: 'Deleted',
  isLocked: 'Lock',
};

const DATE_FORMAT = new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });

/** `07 Mar 2024`, or an em dash for a missing or unreadable value. */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FORMAT.format(date);
}

/**
 * Whether the master says this distributor has resigned.
 *
 * Every master row carries a resignation date. Far-future dates (2030-12-30, 2050-12-31)
 * are placeholders meaning "still working", so only a date that has already passed counts.
 */
export function hasResigned(candidate: DistributorCandidateResponse, today = new Date()): boolean {
  if (!candidate.resignationDate) {
    return false;
  }
  const date = new Date(candidate.resignationDate);
  return !Number.isNaN(date.getTime()) && date.getTime() <= today.getTime();
}
