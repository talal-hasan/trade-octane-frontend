import { Injectable, inject, signal } from '@angular/core';
import { Observable, delay, of, tap } from 'rxjs';

import { PermissionService } from '../../../core/services/permission.service';
import { ClaimRecord, ClaimStatus, ClaimType, NewClaimInput } from '../models/claim.model';
import { buildActivity, buildChain, createClaimRecord, currentStepFor } from './claim-factory';
import { ClaimsService } from './claims.service';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedInput {
  id: string;
  type: ClaimType;
  region: string;
  head: string;
  month: string;
  year: number;
  amount: number;
  currentStageIndex: number;
  status: ClaimStatus;
  raisedBy: string;
  documentName?: string;
  createdDaysAgo: number;
}

// Expands a compact seed row into a full ClaimRecord with a coherent chain + activity trail.
function seed(input: SeedInput): ClaimRecord {
  const createdMs = Date.now() - input.createdDaysAgo * DAY_MS;
  const createdAt = new Date(createdMs).toISOString();
  const steps = buildChain(input.currentStageIndex, input.status, createdMs + 60 * 60 * 1000);
  return {
    id: input.id,
    type: input.type,
    region: input.region,
    head: input.head,
    month: input.month,
    year: input.year,
    amount: input.amount,
    documentName: input.documentName,
    currentStageIndex: input.currentStageIndex,
    status: input.status,
    raisedBy: input.raisedBy,
    createdAt,
    steps,
    currentStepIndex: currentStepFor(input.currentStageIndex, input.status),
    activity: buildActivity(input.raisedBy, steps, createdAt),
  };
}

// 11 fixture claims across all three types, all pipeline stages, and a mix of statuses.
const MOCK_CLAIMS: ClaimRecord[] = [
  seed({ id: 'CLM-2026-201', type: 'normal', region: 'Punjab-North', head: 'North Modern Trade', month: 'June', year: 2026, amount: 2_240_000, currentStageIndex: 0, status: 'pending', raisedBy: 'Waqas Distribution Co.', createdDaysAgo: 2 }),
  seed({ id: 'CLM-2026-202', type: 'damage', region: 'Sindh', head: 'South General Trade', month: 'June', year: 2026, amount: 845_000, currentStageIndex: 1, status: 'pending', raisedBy: 'Waqas Distribution Co.', documentName: 'damage-report-202.pdf', createdDaysAgo: 4 }),
  seed({ id: 'CLM-2026-203', type: 'delay', region: 'Punjab-South', head: 'Central Wholesale', month: 'May', year: 2026, amount: 1_120_000, currentStageIndex: 2, status: 'approved', raisedBy: 'Mehran Traders', createdDaysAgo: 9 }),
  seed({ id: 'CLM-2026-204', type: 'normal', region: 'KPK', head: 'Frontier Retail', month: 'May', year: 2026, amount: 3_500_000, currentStageIndex: 1, status: 'pending', raisedBy: 'Frontier Sales', createdDaysAgo: 3 }),
  seed({ id: 'CLM-2026-205', type: 'damage', region: 'Punjab-North', head: 'North Modern Trade', month: 'June', year: 2026, amount: 610_000, currentStageIndex: 0, status: 'draft', raisedBy: 'Waqas Distribution Co.', documentName: 'transit-damage-205.jpg', createdDaysAgo: 1 }),
  seed({ id: 'CLM-2026-206', type: 'delay', region: 'Balochistan', head: 'West Distribution', month: 'April', year: 2026, amount: 980_000, currentStageIndex: 1, status: 'rejected', raisedBy: 'Quetta Traders', createdDaysAgo: 12 }),
  seed({ id: 'CLM-2026-207', type: 'normal', region: 'Sindh', head: 'South General Trade', month: 'May', year: 2026, amount: 4_150_000, currentStageIndex: 2, status: 'approved', raisedBy: 'Indus Distribution', createdDaysAgo: 15 }),
  seed({ id: 'CLM-2026-208', type: 'damage', region: 'Punjab-South', head: 'Central Wholesale', month: 'June', year: 2026, amount: 1_750_000, currentStageIndex: 1, status: 'overdue', raisedBy: 'Mehran Traders', documentName: 'damage-claim-208.pdf', createdDaysAgo: 20 }),
  seed({ id: 'CLM-2026-209', type: 'delay', region: 'Punjab-North', head: 'North Modern Trade', month: 'June', year: 2026, amount: 720_000, currentStageIndex: 0, status: 'pending', raisedBy: 'Waqas Distribution Co.', createdDaysAgo: 1 }),
  seed({ id: 'CLM-2026-210', type: 'normal', region: 'KPK', head: 'Frontier Retail', month: 'April', year: 2026, amount: 2_960_000, currentStageIndex: 1, status: 'pending', raisedBy: 'Frontier Sales', createdDaysAgo: 6 }),
  seed({ id: 'CLM-2026-211', type: 'damage', region: 'Sindh', head: 'South General Trade', month: 'May', year: 2026, amount: 1_340_000, currentStageIndex: 2, status: 'approved', raisedBy: 'Indus Distribution', documentName: 'damage-claim-211.pdf', createdDaysAgo: 18 }),
];

@Injectable()
export class MockClaimsService extends ClaimsService {
  private readonly permissionService = inject(PermissionService);

  // The store: a single signal every consumer reads reactively.
  private readonly claimsSignal = signal<ClaimRecord[]>(MOCK_CLAIMS);
  readonly claims = this.claimsSignal.asReadonly();

  // Sequence for generated ids, offset well past the seed set to avoid collisions.
  private sequence = 900;

  refresh(): Observable<readonly ClaimRecord[]> {
    // 500ms delay exercises the loading (skeleton) state on first load.
    return of(this.claimsSignal()).pipe(delay(500));
  }

  create(input: NewClaimInput): Observable<ClaimRecord> {
    const id = `CLM-${new Date().getFullYear()}-${String(++this.sequence).padStart(3, '0')}`;
    const raisedBy = this.permissionService.context().name || 'You';
    const claim = createClaimRecord(id, input, raisedBy);
    // 1.2s delay simulates the API round-trip; the store updates on success so the list
    // (and inbox) show the new claim reactively.
    return of(claim).pipe(
      delay(1200),
      tap((created) => this.claimsSignal.update((claims) => [created, ...claims])),
    );
  }
}
