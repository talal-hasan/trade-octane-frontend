// Type-only import reuses the activity-timeline shape without pulling the component into
// the eager app.config graph (the schemes store is provided at root).
import type { ActivityEntry } from '../../../shared/components/activity-timeline/activity-timeline.component';

// A trade scheme (CLAUDE.md §8). Two scheme types (BRD / Trade Offer) with separate
// sequence IDs. Lifecycle: Active → Paused → Expired. Expiry is a one-way, instant action
// that must be confirmed first (§8). Status values are scheme-specific (not StatusPill's).
export type SchemeType = 'brd' | 'trade-offer';
export type SchemeStatus = 'active' | 'paused' | 'expired';

export const SCHEME_TYPE_LABELS: Record<SchemeType, string> = {
  brd: 'BRD',
  'trade-offer': 'Trade Offer',
};

export const SCHEME_STATUS_LABELS: Record<SchemeStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  expired: 'Expired',
};

export interface Scheme {
  id: string; // e.g. BRD-0042 / TO-0113 (sequences can repeat across types — §8)
  name: string;
  type: SchemeType;
  region: string;
  brand: string;
  discountPercent: number; // single-slab discount (§8)
  redemptionPercent: number; // 0–100 consumption meter
  expiryDate: string; // ISO date string
  status: SchemeStatus;
  activity: ActivityEntry[];
}
