import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import { ApprovalDecision, ApprovalInboxItem } from '../models/approval-item.model';
import { ApprovalsService } from './approvals.service';

// Deterministic timestamps relative to "now" so the relative-date pipe renders sensibly
// in demos without the fixtures going stale.
function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

const MOCK_INBOX: ApprovalInboxItem[] = [
  {
    id: 'app-001',
    type: 'budget',
    reference: 'BUD-2026-014',
    title: 'Q3 trade budget — Olpers, Punjab-North',
    summary: 'Additional trade spend allocation for the Q3 Olpers push in Punjab-North.',
    requestedBy: 'Ahmed Bilal',
    requestedAt: hoursAgo(4),
    region: 'Punjab-North',
    brand: 'Olpers',
    amount: 3_200_000,
    requiredPermission: 'BUDGET_APPROVE',
    headroom: { total: 12_000_000, consumed: 7_400_000, pending: 3_200_000 },
    steps: [
      {
        role: 'RSM',
        name: 'Ahmed Bilal',
        status: 'approved',
        timestamp: hoursAgo(4),
        remarks: 'Within regional plan, requesting approval.',
      },
      { role: 'Head of Sales', name: 'Farhan Malik', status: 'pending' },
      { role: 'Finance', name: 'Nida Sheikh', status: 'waiting' },
    ],
    currentStepIndex: 1,
  },
  {
    id: 'app-002',
    type: 'claim',
    reference: 'CLM-2026-231',
    title: 'Damage claim — Nurpur, Sindh',
    summary: 'Transit damage on 420 cartons during the June primary dispatch.',
    requestedBy: 'Waqas Distribution Co.',
    requestedAt: hoursAgo(9),
    region: 'Sindh',
    brand: 'Nurpur',
    amount: 845_000,
    requiredPermission: 'CLAIMS_APPROVE',
    pipelineStages: ['VBase', 'Trade Spend', 'Pujar'],
    currentStageIndex: 1,
    steps: [
      {
        role: 'Distributor',
        name: 'Waqas Distribution Co.',
        status: 'approved',
        timestamp: hoursAgo(30),
        remarks: 'Damage photos and gate-pass attached.',
      },
      {
        role: 'RSM',
        name: 'Ahmed Bilal',
        status: 'approved',
        timestamp: hoursAgo(9),
        remarks: 'Verified against dispatch record.',
      },
      { role: 'Finance', name: 'Nida Sheikh', status: 'pending' },
    ],
    currentStepIndex: 2,
  },
  {
    id: 'app-003',
    type: 'scheme',
    reference: 'BRD-0042',
    title: 'BRD single-slab discount — Tarang',
    summary: '5% single-slab retailer discount for Tarang, Punjab-South, September window.',
    requestedBy: 'Hina Raza',
    requestedAt: hoursAgo(21),
    region: 'Punjab-South',
    brand: 'Tarang',
    amount: 1_500_000,
    requiredPermission: 'SCHEME_APPROVE',
    steps: [
      {
        role: 'Trade Category',
        name: 'Hina Raza',
        status: 'approved',
        timestamp: hoursAgo(21),
        remarks: 'Aligned with September activation calendar.',
      },
      { role: 'Head of Sales', name: 'Farhan Malik', status: 'pending' },
    ],
    currentStepIndex: 1,
  },
  {
    id: 'app-004',
    type: 'budget',
    reference: 'BUD-2026-018',
    title: 'Brand budget top-up — Nurpur, Sindh',
    summary: 'Top-up to cover an over-indexed Ramadan trade programme for Nurpur.',
    requestedBy: 'Sara Iqbal',
    requestedAt: hoursAgo(28),
    region: 'Sindh',
    brand: 'Nurpur',
    amount: 1_850_000,
    requiredPermission: 'BUDGET_APPROVE',
    headroom: { total: 6_000_000, consumed: 5_100_000, pending: 1_850_000 },
    steps: [
      {
        role: 'RMC',
        name: 'Sara Iqbal',
        status: 'approved',
        timestamp: hoursAgo(28),
        remarks: 'Programme ran ahead of plan; requesting top-up.',
      },
      { role: 'Head of Sales', name: 'Farhan Malik', status: 'pending' },
      { role: 'Finance', name: 'Nida Sheikh', status: 'waiting' },
    ],
    currentStepIndex: 1,
  },
  {
    id: 'app-005',
    type: 'claim',
    reference: 'CLM-2026-244',
    title: 'Normal trade claim — Olpers, Punjab-North',
    summary: 'Quarterly trade-spend settlement for the Olpers retailer scheme.',
    requestedBy: 'Waqas Distribution Co.',
    requestedAt: hoursAgo(35),
    region: 'Punjab-North',
    brand: 'Olpers',
    amount: 2_240_000,
    requiredPermission: 'CLAIMS_APPROVE',
    pipelineStages: ['VBase', 'Trade Spend', 'Pujar'],
    currentStageIndex: 0,
    steps: [
      {
        role: 'Distributor',
        name: 'Waqas Distribution Co.',
        status: 'approved',
        timestamp: hoursAgo(35),
      },
      { role: 'RSM', name: 'Ahmed Bilal', status: 'pending' },
      { role: 'Finance', name: 'Nida Sheikh', status: 'waiting' },
    ],
    currentStepIndex: 1,
  },
  {
    id: 'app-006',
    type: 'scheme',
    reference: 'TO-0113',
    title: 'Trade Offer — Olpers festive bundle',
    summary: 'Festive bundle trade offer for Olpers across Punjab-North and Punjab-South.',
    requestedBy: 'Ahmed Bilal',
    requestedAt: hoursAgo(48),
    region: 'Punjab-North',
    brand: 'Olpers',
    amount: 4_600_000,
    requiredPermission: 'SCHEME_APPROVE',
    steps: [
      {
        role: 'RSM',
        name: 'Ahmed Bilal',
        status: 'approved',
        timestamp: hoursAgo(48),
      },
      {
        role: 'Trade Category',
        name: 'Hina Raza',
        status: 'approved',
        timestamp: hoursAgo(40),
        remarks: 'Margins check out.',
      },
      { role: 'Head of Sales', name: 'Farhan Malik', status: 'pending' },
    ],
    currentStepIndex: 2,
  },
  {
    id: 'app-007',
    type: 'budget',
    reference: 'BUD-2026-021',
    title: 'Q4 trade budget — Tarang, Punjab-South',
    summary: 'Opening Q4 trade budget for Tarang ahead of the winter cycle.',
    requestedBy: 'Sara Iqbal',
    requestedAt: hoursAgo(60),
    region: 'Punjab-South',
    brand: 'Tarang',
    amount: 5_400_000,
    requiredPermission: 'BUDGET_APPROVE',
    headroom: { total: 20_000_000, consumed: 9_800_000, pending: 5_400_000 },
    steps: [
      {
        role: 'RMC',
        name: 'Sara Iqbal',
        status: 'approved',
        timestamp: hoursAgo(60),
      },
      { role: 'Head of Sales', name: 'Farhan Malik', status: 'pending' },
      { role: 'Finance', name: 'Nida Sheikh', status: 'waiting' },
    ],
    currentStepIndex: 1,
  },
];

@Injectable()
export class MockApprovalsService extends ApprovalsService {
  // Clone so a caller mutating the returned array can't corrupt the fixture set.
  private inbox: ApprovalInboxItem[] = MOCK_INBOX.map((item) => ({ ...item }));

  getInbox(): Observable<ApprovalInboxItem[]> {
    // 600ms delay exercises the skeleton-loader state on the inbox.
    return of(this.inbox.map((item) => ({ ...item }))).pipe(delay(600));
  }

  decide(itemId: string, _decision: ApprovalDecision, _remarks: string): Observable<void> {
    this.inbox = this.inbox.filter((item) => item.id !== itemId);
    return of(undefined).pipe(delay(400));
  }
}
