import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import { ClaimRecord } from '../models/claim.model';
import { ClaimsService } from './claims.service';

// 11 fixture claims spanning all three types (Normal / Delay / Damage), all three pipeline
// stages, and a mix of statuses — enough to demonstrate the pipeline column and status pills.
const MOCK_CLAIMS: ClaimRecord[] = [
  { id: 'CLM-2026-201', type: 'normal', region: 'Punjab-North', amount: 2_240_000, currentStageIndex: 0, status: 'pending', raisedBy: 'Waqas Distribution Co.' },
  { id: 'CLM-2026-202', type: 'damage', region: 'Sindh', amount: 845_000, currentStageIndex: 1, status: 'pending', raisedBy: 'Waqas Distribution Co.' },
  { id: 'CLM-2026-203', type: 'delay', region: 'Punjab-South', amount: 1_120_000, currentStageIndex: 2, status: 'approved', raisedBy: 'Mehran Traders' },
  { id: 'CLM-2026-204', type: 'normal', region: 'KPK', amount: 3_500_000, currentStageIndex: 1, status: 'pending', raisedBy: 'Frontier Sales' },
  { id: 'CLM-2026-205', type: 'damage', region: 'Punjab-North', amount: 610_000, currentStageIndex: 0, status: 'draft', raisedBy: 'Waqas Distribution Co.' },
  { id: 'CLM-2026-206', type: 'delay', region: 'Balochistan', amount: 980_000, currentStageIndex: 2, status: 'rejected', raisedBy: 'Quetta Traders' },
  { id: 'CLM-2026-207', type: 'normal', region: 'Sindh', amount: 4_150_000, currentStageIndex: 2, status: 'approved', raisedBy: 'Indus Distribution' },
  { id: 'CLM-2026-208', type: 'damage', region: 'Punjab-South', amount: 1_750_000, currentStageIndex: 1, status: 'overdue', raisedBy: 'Mehran Traders' },
  { id: 'CLM-2026-209', type: 'delay', region: 'Punjab-North', amount: 720_000, currentStageIndex: 0, status: 'pending', raisedBy: 'Waqas Distribution Co.' },
  { id: 'CLM-2026-210', type: 'normal', region: 'KPK', amount: 2_960_000, currentStageIndex: 1, status: 'pending', raisedBy: 'Frontier Sales' },
  { id: 'CLM-2026-211', type: 'damage', region: 'Sindh', amount: 1_340_000, currentStageIndex: 2, status: 'approved', raisedBy: 'Indus Distribution' },
];

@Injectable()
export class MockClaimsService extends ClaimsService {
  getClaims(): Observable<ClaimRecord[]> {
    return of(MOCK_CLAIMS.map((record) => ({ ...record }))).pipe(delay(500));
  }
}
