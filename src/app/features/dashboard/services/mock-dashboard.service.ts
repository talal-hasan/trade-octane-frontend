import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import {
  AttentionItem,
  BarDatum,
  BreakdownRow,
  DashboardCharts,
  Delta,
} from '../models/dashboard.model';
import { DashboardService } from './dashboard.service';

// Full national picture. Everything returned to a caller is a subset of this, filtered to
// the regions/brands on their UserContext — so switching roles in the dev panel visibly
// changes the numbers, which is the point the client needs to see demonstrated.

interface RegionSpend {
  region: string;
  committed: number;
  allocated: number;
  delta: Delta;
}

const SPEND_BY_REGION: RegionSpend[] = [
  {
    region: 'Punjab-North',
    committed: 41_200_000,
    allocated: 52_000_000,
    delta: { percent: 4.2, direction: 'up', comparedTo: 'vs last month', good: true },
  },
  {
    region: 'Punjab-South',
    committed: 28_900_000,
    allocated: 38_000_000,
    delta: { percent: 1.8, direction: 'down', comparedTo: 'vs last month', good: false },
  },
  {
    region: 'Sindh',
    committed: 47_600_000,
    allocated: 45_000_000,
    delta: { percent: 12.4, direction: 'up', comparedTo: 'vs last month', good: false },
  },
  {
    region: 'KPK',
    committed: 12_400_000,
    allocated: 22_000_000,
    delta: { percent: 6.1, direction: 'up', comparedTo: 'vs last month', good: true },
  },
  {
    region: 'Balochistan',
    committed: 6_100_000,
    allocated: 14_000_000,
    delta: { percent: 0, direction: 'flat', comparedTo: 'vs last month', good: true },
  },
];

// Litres, not cartons — the industry unit throughout (KT §8 Confirmed Business Rules).
const VOLUME_BY_BRAND: (BarDatum & { brand: string })[] = [
  { brand: 'Olpers', label: 'Olpers', value: 1_840_000 },
  { brand: 'Tarang', label: 'Tarang', value: 1_210_000 },
  { brand: 'Nurpur', label: 'Nurpur', value: 640_000 },
];

const APPROVALS_CLEARED = [
  { label: 'Mar', value: 38 },
  { label: 'Apr', value: 45 },
  { label: 'May', value: 41 },
  { label: 'Jun', value: 58 },
  { label: 'Jul', value: 52 },
  { label: 'Aug', value: 67 },
];

const ATTENTION: (AttentionItem & { region: string })[] = [
  {
    id: 'att-1',
    region: 'Sindh',
    reference: 'BUD-2026-009',
    title: 'Sindh / Olpers Q3 budget is overrun',
    reason: 'Committed spend exceeds the approved allocation by PKR 2,600,000.',
    module: 'Budget',
    age: '2 days',
    tone: 'critical',
    requiredPermission: 'BUDGET_VIEW',
    route: '/budget',
  },
  {
    id: 'att-2',
    region: 'Punjab-North',
    reference: 'BRD-0042',
    title: 'Master SKU changed on a live scheme',
    reason: 'SAP master data moved this SKU mid-flight — verify before the next claim run.',
    module: 'Scheme',
    age: '4 days',
    tone: 'warning',
    requiredPermission: 'SCHEME_VIEW',
    route: '/schemes',
  },
  {
    id: 'att-3',
    region: 'Punjab-South',
    reference: 'TO-0113',
    title: 'Trade Offer expires in 3 days',
    reason: 'Scheme ends 21 Aug. Extend it or let it close — no action means it closes.',
    module: 'Scheme',
    age: '3 days left',
    tone: 'warning',
    requiredPermission: 'SCHEME_VIEW',
    route: '/schemes',
  },
  {
    id: 'att-4',
    region: 'KPK',
    reference: 'CLM-2026-188',
    title: 'Claim held at Trade Spend for 9 days',
    reason: 'Past the 5-day internal SLA. Escalates to GM at 14 days.',
    module: 'Claim',
    age: '9 days',
    tone: 'critical',
    requiredPermission: 'CLAIMS_VIEW',
    route: '/claims',
  },
  {
    id: 'att-5',
    region: 'Punjab-North',
    reference: 'CLM-2026-201',
    title: 'Damage claim missing supporting document',
    reason: 'Distributor submitted without the required damage report. Blocked at VBase.',
    module: 'Claim',
    age: '6 days',
    tone: 'warning',
    requiredPermission: 'CLAIMS_VIEW',
    route: '/claims',
  },
];

@Injectable()
export class MockDashboardService extends DashboardService {
  getCharts(regions: readonly string[], brands: readonly string[]): Observable<DashboardCharts> {
    // A user with no explicit scope (e.g. a global role) sees everything rather than
    // nothing — an empty scope list means "unrestricted", not "denied".
    const inRegion = (region: string) => regions.length === 0 || regions.includes(region);
    const inBrand = (brand: string) => brands.length === 0 || brands.includes(brand);

    const visibleRegions = SPEND_BY_REGION.filter((row) => inRegion(row.region));
    const committed = visibleRegions.reduce((sum, row) => sum + row.committed, 0);
    const allocated = visibleRegions.reduce((sum, row) => sum + row.allocated, 0);

    // Each region's share of the committed total drives its segment of the meter, so the
    // bar and the rows beside it can never disagree.
    const rows: BreakdownRow[] = visibleRegions.map((row) => ({
      label: row.region,
      value: row.committed,
      share: committed === 0 ? 0 : (row.committed / committed) * 100,
      delta: row.delta,
    }));

    const volumeByBrand = VOLUME_BY_BRAND.filter((row) => inBrand(row.brand)).map(
      ({ brand: _brand, ...datum }) => datum,
    );

    // Scheme mix and the trend scale with how much of the country the user can see, so
    // the charts stay proportionate to the tiles above them instead of contradicting them.
    const share = visibleRegions.length / SPEND_BY_REGION.length;
    const scale = (national: number) => Math.max(1, Math.round(national * share));

    return of<DashboardCharts>({
      utilisation: {
        committed,
        allocated,
        delta: { percent: 5.4, direction: 'up', comparedTo: 'vs last month', good: true },
        rows,
      },
      volumeByBrand,
      schemeMix: [
        { label: 'Trade Offer', value: scale(34) },
        { label: 'BRD', value: scale(21) },
      ],
      approvalsCleared: APPROVALS_CLEARED.map((point) => ({
        label: point.label,
        value: scale(point.value),
      })),
    }).pipe(delay(280));
  }

  getAttention(regions: readonly string[]): Observable<AttentionItem[]> {
    const inRegion = (region: string) => regions.length === 0 || regions.includes(region);
    return of(
      ATTENTION.filter((row) => inRegion(row.region)).map(({ region: _region, ...item }) => item),
    ).pipe(delay(320));
  }
}
