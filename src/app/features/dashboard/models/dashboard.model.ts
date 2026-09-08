// View models for the Dashboard landing page.
//
// The Dashboard is read-only by design: it shows *what needs attention* and nothing else,
// then hands off to the workspace that owns the work. Every tile therefore carries the
// permission that gates it and the route it drills into — the component never decides
// visibility itself, it just filters on `requiredAnyOf` (CLAUDE.md §4).

/** Semantic weight of a figure — drives which brand hue the element wears. */
export type TileTone = 'accent' | 'warning' | 'critical' | 'success' | 'neutral';

/**
 * Period-over-period change attached to a figure.
 *
 * A bare number on a dashboard is close to useless — "6 claims past SLA" only means
 * something against "and it was 9 last week". Every tile carries one.
 *
 * `good` is separate from `direction` on purpose: rising volume is good, rising SLA
 * breaches is not, and the colour must follow the *meaning*, not the arrow.
 */
export interface Delta {
  /** Percentage change, already rounded. Sign is carried by `direction`. */
  percent: number;
  direction: 'up' | 'down' | 'flat';
  /** What it is being compared against, e.g. "vs last week". */
  comparedTo: string;
  /** True when this movement is a good thing for the business. */
  good: boolean;
}

export interface DashboardTile {
  key: string;
  label: string;
  /** The single number this tile exists to communicate. */
  value: number;
  icon: string;
  tone: TileTone;
  delta?: Delta;
  /**
   * Permissions that grant sight of this tile, ANY of which suffices.
   *
   * "Any of" rather than a single permission because a tile can summarise more than one
   * module: the approvals tile is relevant to anyone holding any approval right, and
   * gating it on a single one (CLAIMS_VIEW, say) would hide it from a Trade Category
   * Manager who can approve schemes but never sees claims.
   */
  requiredAnyOf: string[];
  /** Where clicking drills to — the workspace that owns these records. */
  route: string;
  queryParams?: Record<string, string>;
}

/** One bar in a horizontal bar chart. `value` and `total` are in the chart's own unit. */
export interface BarDatum {
  label: string;
  value: number;
  /** When set, the bar renders as value-of-total with a track behind it. */
  total?: number;
  /** Overrides the series colour — used to flag an overrun bar in Passion red. */
  tone?: TileTone;
}

/** One arc in the donut. */
export interface SliceDatum {
  label: string;
  value: number;
}

/**
 * A row in the utilisation breakdown beside the segmented meter.
 *
 * Mirrors the "Highlights" panel in the client's reference mock: one headline figure,
 * a segmented bar showing composition, then the constituent rows each with their own
 * value and movement. It is the densest useful thing on the page.
 */
export interface BreakdownRow {
  label: string;
  value: number;
  /** Share of the total, 0–100, driving this row's segment of the meter. */
  share: number;
  delta?: Delta;
}

export interface UtilisationPanel {
  /** Headline figure — total committed spend in the user's scope, PKR. */
  committed: number;
  /** Total approved allocation in the user's scope, PKR. */
  allocated: number;
  delta: Delta;
  /** Composition of the committed figure. Segments render in viz order. */
  rows: BreakdownRow[];
}

/** A point on the trend line. */
export interface TrendPoint {
  label: string;
  value: number;
}

export interface DashboardCharts {
  /** Committed spend composition + headline, for the utilisation hero. */
  utilisation: UtilisationPanel;
  /** Activated scheme volume per brand, in litres — the industry unit (KT §8). */
  volumeByBrand: BarDatum[];
  /** Scheme mix by type — BRD vs Trade Offer. */
  schemeMix: SliceDatum[];
  /** Approvals cleared per month — the trend line. */
  approvalsCleared: TrendPoint[];
}

/** A record the user should look at now — master-data drift, SLA breach, expiring scheme. */
export interface AttentionItem {
  id: string;
  reference: string;
  title: string;
  reason: string;
  /** Module label for the table's Type column. */
  module: string;
  /** How long this has been outstanding, e.g. "9 days". */
  age: string;
  tone: TileTone;
  requiredPermission: string;
  route: string;
}
