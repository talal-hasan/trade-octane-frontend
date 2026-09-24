import { HttpErrorResponse } from '@angular/common/http';

import { ApproveTradeOfferCatalogueResponse, ApproveTradeOfferResponse } from '../../../core/api/approve.models';
import {
  MAX_FINALS,
  QUEUE_ORDER,
  SchemeRow,
  approvalChainOf,
  filterRows,
  formatMoney,
  formatPercent,
  mechanicsFigures,
  outcomeNote,
  ownerIssue,
  periodRange,
  planDecision,
  postingSeconds,
  refusalOf,
  sortRows,
  stillWaiting,
  toRow,
} from './approve-trade-offers.util';

const NOW = new Date('2026-09-25T12:00:00');

const TARIQ = { userId: 'MehmoT01', fullName: 'Tariq Mehmood' };
const UMAIR = { userId: 'AwanU01', fullName: 'Umair Awan' };
const MUDASSIR = { userId: 'HussaM10', fullName: 'Mudassir Hussain' };
const RMC = { userId: 'KhanR05', fullName: 'Rabia Khan' };

function wire(overrides: Partial<ApproveTradeOfferResponse> = {}): ApproveTradeOfferResponse {
  return {
    seqId: '183715',
    schemeId: 'TR_010_LHR',
    description: 'Olpers ProCal 200ml',
    from: '2026-10-01T00:00:00',
    to: '2026-10-07T00:00:00',
    claimType: 'TO',
    claimTypeName: 'Trade Offer',
    processDescription: 'Based on WEIGHT - Return in Value',
    shellCode: '02-39899-31/2026-10',
    budgetOwner: UMAIR,
    budgetOwnerActive: true,
    criterion: 'MASTER_SKU',
    dimension: 'Master SKU',
    value: 'MS01',
    valueName: 'Olpers ProCal 200ml',
    regionCode: '02',
    regionName: 'Lahore',
    year: 2026,
    month: 10,
    monthName: 'OCT',
    businessType: '1',
    businessTypeName: 'Dairy',
    grossProfitPerLitre: '108.00',
    totalDiscount: '20710.00',
    activatedVolume: 4142,
    perLitreDiscount: 5,
    roi: '440.00',
    uplift: 35.71,
    database: 'Salesflo',
    salesflo: null,
    quantityFrom: 4.8,
    quantityTo: 99999,
    level: 1,
    isFinal: false,
    waitingSince: '2026-09-20T09:00:00',
    initiatedBy: RMC,
    initiatedOn: '2026-09-20T09:00:00',
    approvalSteps: [{ level: 1, userId: TARIQ.userId, fullName: TARIQ.fullName }],
    ...overrides,
  };
}

function row(overrides: Partial<ApproveTradeOfferResponse> = {}): SchemeRow {
  return toRow(wire(overrides), NOW);
}

const CATALOGUE: ApproveTradeOfferCatalogueResponse = {
  levels: [
    { level: 1, roleName: 'RSM', pendingCount: 1, totalDiscount: 20710, forwarding: 'BudgetOwner' },
    { level: 2, roleName: 'TCM', pendingCount: 1, totalDiscount: 1000, forwarding: 'ChosenApprover' },
    { level: 3, roleName: 'FBP On Invoice', pendingCount: 2, totalDiscount: 5000, forwarding: 'None' },
  ],
  pendingCount: 4,
  totalDiscount: 26710,
  forwardTo: [MUDASSIR],
  salesfloAvailable: true,
};

describe('toRow', () => {
  it('reads wire decimals and names the period', () => {
    const scheme = row();
    expect(scheme.totalDiscount).toBe(20710);
    expect(scheme.roi).toBe(440);
    expect(scheme.period).toBe(periodRange('2026-10-01T00:00:00', '2026-10-07T00:00:00'));
    expect(scheme.waitingDays).toBe(5);
  });

  it('keeps no Salesflo answer when every part is empty', () => {
    expect(row({ salesflo: { status: '', code: '', message: '' } }).salesflo).toBeNull();
    expect(row({ salesflo: { status: 'Failed', code: 'E1', message: 'Bad' } }).salesflo).not.toBeNull();
  });
});

describe('periodRange', () => {
  it('shortens a period inside one month', () => {
    const range = periodRange('2026-10-01T00:00:00', '2026-10-07T00:00:00');
    expect(range).toContain('01');
    expect(range).toContain('07');
    expect(range.match(/2026/g)?.length).toBe(1);
  });

  it('names both years when a period crosses one', () => {
    expect(periodRange('2026-12-28T00:00:00', '2027-01-03T00:00:00')).toMatch(/2026.*2027/);
  });

  it('says so when there is no date at all', () => {
    expect(periodRange(null, null)).toBe('—');
  });
});

describe('filterRows and sortRows', () => {
  const rows = [
    row({ seqId: '1', level: 1, description: 'Olpers', totalDiscount: 10, waitingSince: '2026-09-23T00:00:00' }),
    row({ seqId: '2', level: 3, description: 'Tarang', shellCode: 'SH-77', totalDiscount: 30, waitingSince: '2026-09-01T00:00:00' }),
    row({ seqId: '3', level: 3, description: 'Omung', schemeId: 'TR_099', totalDiscount: 20, waitingSince: '2026-09-10T00:00:00' }),
  ];

  it('searches the sequence id, scheme id, description and shell code', () => {
    expect(filterRows(rows, { level: null, search: 'sh-77' }).map((r) => r.seqId)).toEqual(['2']);
    expect(filterRows(rows, { level: null, search: 'tr_099' }).map((r) => r.seqId)).toEqual(['3']);
    expect(filterRows(rows, { level: 3, search: '' }).map((r) => r.seqId)).toEqual(['2', '3']);
  });

  it('puts the longest waiting first, and sorts by discount', () => {
    expect(sortRows(rows, QUEUE_ORDER).map((r) => r.seqId)).toEqual(['2', '3', '1']);
    expect(sortRows(rows, { key: 'discount', descending: true }).map((r) => r.seqId)).toEqual(['2', '3', '1']);
    expect(sortRows(rows, { key: 'discount', descending: false }).map((r) => r.seqId)).toEqual(['1', '3', '2']);
  });
});

describe('ownerIssue', () => {
  it('flags a level 1 scheme whose owner cannot receive it', () => {
    expect(ownerIssue(row({ budgetOwner: null }), 'MehmoT01')).toBe('The budget has no owner');
    expect(ownerIssue(row({ budgetOwnerActive: false }), 'MehmoT01')).toContain('inactive');
    expect(ownerIssue(row({ budgetOwner: TARIQ }), 'mehmot01')).toContain('You own the budget');
    expect(ownerIssue(row(), 'MehmoT01')).toBeNull();
  });

  it('only applies at level 1', () => {
    expect(ownerIssue(row({ level: 2, budgetOwner: null }), 'MehmoT01')).toBeNull();
  });
});

describe('planDecision', () => {
  it('sorts the selection by where each scheme goes', () => {
    const plan = planDecision(
      [
        row({ seqId: '1', level: 1 }),
        row({ seqId: '2', level: 1, budgetOwnerActive: false }),
        row({ seqId: '3', level: 2 }),
        row({ seqId: '4', level: 3, isFinal: true, database: 'Salesflo' }),
        row({ seqId: '5', level: 3, isFinal: true, database: 'Orange' }),
      ],
      CATALOGUE,
      'MehmoT01',
    );
    expect(plan.owners).toEqual([{ name: 'Umair Awan', count: 1 }]);
    expect(plan.ownerProblems.map((r) => r.seqId)).toEqual(['2']);
    expect(plan.toChosen.map((r) => r.seqId)).toEqual(['3']);
    expect(plan.finals.map((r) => r.seqId)).toEqual(['4', '5']);
    expect(plan.salesfloFinals.map((r) => r.seqId)).toEqual(['4']);
    expect(plan.unpostable).toEqual([]);
  });

  it('marks Salesflo finals unpostable where this server does not post', () => {
    const plan = planDecision(
      [row({ seqId: '4', level: 3, isFinal: true, database: 'Salesflo' }), row({ seqId: '5', level: 3, database: 'Orange' })],
      { ...CATALOGUE, salesfloAvailable: false },
      'MehmoT01',
    );
    expect(plan.unpostable.map((r) => r.seqId)).toEqual(['4']);
  });
});

describe('postingSeconds', () => {
  it('estimates four Salesflo posts at a time', () => {
    expect(postingSeconds(0)).toBe(0);
    expect(postingSeconds(1)).toBe(7);
    expect(postingSeconds(5)).toBe(14);
    expect(postingSeconds(MAX_FINALS)).toBe(35);
  });
});

describe('approvalChainOf', () => {
  it('names the budget owner as level 2 before level 1 signs', () => {
    const scheme = row();
    const chain = approvalChainOf({
      initiatedBy: scheme.initiatedBy,
      initiatedOn: scheme.initiatedOn,
      steps: scheme.steps,
      level: 1,
      budgetOwner: scheme.budgetOwner,
    });
    expect(chain.map((step) => [step.role, step.name, step.status])).toEqual([
      ['Sent for approval', 'Rabia Khan', 'approved'],
      ['Level 1 · RSM', 'Tariq Mehmood', 'pending'],
      ['Level 2 · Budget owner', 'Umair Awan', 'waiting'],
      ['Level 3 · FBP · final', 'Chosen when level 2 approves', 'waiting'],
    ]);
  });
});

describe('outcomes', () => {
  it('keeps a scheme Salesflo refused in the queue', () => {
    expect(stillWaiting('RefusedBySalesflo')).toBe(true);
    expect(stillWaiting('CannotForward')).toBe(true);
    expect(stillWaiting('Approved')).toBe(false);
    expect(stillWaiting('NotPending')).toBe(false);
  });

  it('quotes Salesflo when it refused', () => {
    expect(
      outcomeNote({
        seqId: '1',
        outcome: 'RefusedBySalesflo',
        notification: 'Queued',
        notifiedUser: RMC,
        salesflo: { status: 'Failed', code: 'E102', message: 'Invalid distributor' },
      }),
    ).toBe('Salesflo said: Failed · E102 · Invalid distributor. It still waits on you; Rabia Khan was told.');
  });

  it("prefers the server's own note for a skipped scheme", () => {
    expect(
      outcomeNote({ seqId: '1', outcome: 'CannotForward', notification: 'None', message: 'The owner is inactive.' }),
    ).toBe('The owner is inactive.');
  });
});

describe('formats', () => {
  it('shows paise only when there are some', () => {
    expect(formatMoney(20710)).toBe('PKR 20,710');
    expect(formatMoney(20710.4)).toBe('PKR 20,710.40');
    expect(formatPercent(35.71)).toBe('35.71%');
  });

  it('colours ROI and uplift as legacy did', () => {
    const figures = mechanicsFigures({
      shellCode: 'S',
      grossProfitPerLitre: 108,
      totalDiscount: 20710,
      activatedVolume: 4142,
      baselineVolume: 2899.4,
      incrementalVolume: 1035.5,
      incrementalGrossProfit: 111834,
      postSchemeDip: 2692.3,
      incrementalProfit: 91124,
      roi: 0,
      uplift: 35.71,
      database: 'Salesflo',
      totalBudget: 50000,
      allocatedElsewhere: 0,
      availableBudget: 50000,
    });
    expect(figures.find((f) => f.label === 'ROI')?.tone).toBe('bad');
    expect(figures.find((f) => f.label === 'Uplift')?.tone).toBe('good');
  });
});

describe('refusalOf', () => {
  function problem(status: number, errorCode: string, detail: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: { errorCode, detail, status } });
  }

  it('points a Forward To refusal at the picker', () => {
    const refusal = refusalOf(problem(400, 'approve.trade_offers.forward_to_not_eligible', "Select 'Forward to' : X"));
    expect(refusal.target).toBe('forwardTo');
    expect(refusal.staleForwardTo).toBe(true);
  });

  it('points too many final approvals at the selection', () => {
    expect(refusalOf(problem(400, 'approve.trade_offers.too_many_final_approvals', '25 of these…')).target).toBe('selection');
  });

  it('marks a lock conflict as retryable', () => {
    expect(refusalOf(problem(409, 'approve.trade_offers.busy', 'Busy')).retryable).toBe(true);
  });
});
