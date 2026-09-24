import { HttpErrorResponse } from '@angular/common/http';

import { ApproveBudgetCatalogueResponse, ApproveBudgetResponse } from '../../../core/api/approve.models';
import {
  BudgetRow,
  QUEUE_ORDER,
  approvalChainOf,
  currentChainIndex,
  defaultForwardTo,
  filterRows,
  outcomeNote,
  planForward,
  refusalOf,
  rejectRecipients,
  sortRows,
  toRow,
  waitingLabel,
} from './approve-budgets.util';

const NOW = new Date('2026-09-24T12:00:00');

const NADA = { userId: 'AhmadN03', fullName: 'Nada Ahmad' };
const UMAIR = { userId: 'AwanU01', fullName: 'Umair Awan' };
const MUDASSIR = { userId: 'HussaM10', fullName: 'Mudassir Hussain' };
const SARA = { userId: 'KhanS22', fullName: 'Sara Khan' };

function wire(overrides: Partial<ApproveBudgetResponse> = {}): ApproveBudgetResponse {
  return {
    shellCode: '05-39896-28/2026-9',
    serialNumber: 39896,
    year: 2026,
    month: 9,
    monthName: 'SEP',
    regionCode: '05',
    regionName: 'Lahore',
    criterion: 'PROD_LEVEL6',
    dimension: 'Brand',
    value: 'B01',
    valueName: 'Olpers',
    schemeTypeId: 1,
    schemeType: 'Trade Offer',
    schemeGroup: 'Trade Offer',
    schemeGroupKey: 'B01',
    description: 'Olpers_Sep_2026_LHR',
    amount: '1500000',
    originalAmount: 1500000,
    level: 1,
    isFinal: false,
    waitingSince: '2026-09-20T09:00:00',
    initiatedBy: NADA,
    initiatedOn: '2026-09-20T09:00:00',
    approvalSteps: [{ level: 1, userId: UMAIR.userId, fullName: UMAIR.fullName }],
    ...overrides,
  };
}

function row(overrides: Partial<ApproveBudgetResponse> = {}): BudgetRow {
  return toRow(wire(overrides), NOW);
}

const CATALOGUE: ApproveBudgetCatalogueResponse = {
  pendingCount: 3,
  budgetTypes: [
    {
      schemeGroupKey: 'B01',
      name: 'Trade Offer',
      pendingCount: 2,
      levels: [
        { level: 1, roleName: 'TCM', pendingCount: 2, isFinal: false, forwardTo: [MUDASSIR, SARA, NADA] },
      ],
    },
    {
      schemeGroupKey: 'B15',
      name: 'BRD',
      pendingCount: 1,
      levels: [
        { level: 2, roleName: 'FBP On Invoice', pendingCount: 0, isFinal: false, forwardTo: [SARA] },
        { level: 3, roleName: 'FBP On Invoice', pendingCount: 1, isFinal: true, forwardTo: [] },
      ],
    },
    {
      schemeGroupKey: 'B20',
      name: 'VTR-1',
      pendingCount: 0,
      levels: [{ level: 1, roleName: 'TCM', pendingCount: 0, isFinal: false, forwardTo: [] }],
    },
  ],
};

describe('toRow', () => {
  it('reads wire integers and names the period', () => {
    const budget = row();
    expect(budget.amount).toBe(1_500_000);
    expect(budget.period).toBe('Sep 2026');
    expect(budget.product).toBe('Olpers');
    expect(budget.waitingDays).toBe(4);
  });

  it('treats level 3 as final even if the flag is missing', () => {
    expect(row({ level: '3', isFinal: false }).isFinal).toBe(true);
  });

  it('falls back to the code when a product no longer resolves', () => {
    expect(row({ valueName: '' }).product).toBe('B01');
  });
});

describe('waitingLabel', () => {
  it('reads days in words', () => {
    expect(waitingLabel(0)).toBe('Today');
    expect(waitingLabel(1)).toBe('1 day');
    expect(waitingLabel(12)).toBe('12 days');
    expect(waitingLabel(null)).toBe('—');
  });
});

describe('filterRows', () => {
  const rows = [
    row({ shellCode: 'A-1', schemeGroupKey: 'B01', level: 1, description: 'Olpers Lahore' }),
    row({ shellCode: 'A-2', schemeGroupKey: 'B15', level: 2, description: 'Tarang Karachi' }),
    row({ shellCode: 'A-3', schemeGroupKey: 'B15', level: 3, description: 'Omung' }),
  ];

  it('filters by type and level together', () => {
    expect(filterRows(rows, { typeKey: 'B15', level: 3, search: '' }).map((r) => r.shellCode)).toEqual(['A-3']);
  });

  it('searches the shell code and description only, as the server does', () => {
    expect(filterRows(rows, { typeKey: null, level: null, search: 'karachi' }).map((r) => r.shellCode)).toEqual(['A-2']);
    expect(filterRows(rows, { typeKey: null, level: null, search: 'a-1' }).map((r) => r.shellCode)).toEqual(['A-1']);
    // The region is not searched, so the grid matches the CSV export.
    expect(filterRows(rows, { typeKey: null, level: null, search: 'lahore' }).map((r) => r.shellCode)).toEqual(['A-1']);
  });
});

describe('sortRows', () => {
  const rows = [
    row({ shellCode: 'NEW', waitingSince: '2026-09-23T09:00:00', amount: 10 }),
    row({ shellCode: 'OLD', waitingSince: '2026-09-01T09:00:00', amount: 30 }),
    row({ shellCode: 'MID', waitingSince: '2026-09-10T09:00:00', amount: 20 }),
  ];

  it('puts the longest waiting first by default', () => {
    expect(sortRows(rows, QUEUE_ORDER).map((r) => r.shellCode)).toEqual(['OLD', 'MID', 'NEW']);
  });

  it('sorts by amount either way', () => {
    expect(sortRows(rows, { key: 'amount', descending: true }).map((r) => r.shellCode)).toEqual(['OLD', 'MID', 'NEW']);
    expect(sortRows(rows, { key: 'amount', descending: false }).map((r) => r.shellCode)).toEqual(['NEW', 'MID', 'OLD']);
  });
});

describe('planForward', () => {
  it('offers the Forward To list of the budgets’ type and level', () => {
    const plan = planForward([row()], CATALOGUE);
    expect(plan.forwarding.length).toBe(1);
    expect(plan.options.map((o) => o.userId)).toEqual(['HussaM10', 'KhanS22', 'AhmadN03']);
  });

  it('disables whoever raised a ticked budget', () => {
    const plan = planForward([row()], CATALOGUE);
    expect(plan.options.find((o) => o.userId === 'AhmadN03')?.disabledReason).toBe('Raised this budget');
    expect(plan.options.find((o) => o.userId === 'HussaM10')?.disabledReason).toBeNull();
  });

  it('offers only people on every ticked type and level', () => {
    const plan = planForward(
      [row({ shellCode: 'A' }), row({ shellCode: 'B', schemeGroupKey: 'B15', level: 2 })],
      CATALOGUE,
    );
    expect(plan.options.map((o) => o.userId)).toEqual(['KhanS22']);
  });

  it('says when no single approver can take the selection', () => {
    const catalogue: ApproveBudgetCatalogueResponse = {
      ...CATALOGUE,
      budgetTypes: CATALOGUE.budgetTypes.map((type) =>
        type.schemeGroupKey === 'B15'
          ? { ...type, levels: [{ ...type.levels[0], forwardTo: [UMAIR] }, type.levels[1]] }
          : type,
      ),
    };
    const plan = planForward(
      [row({ shellCode: 'A' }), row({ shellCode: 'B', schemeGroupKey: 'B15', level: 2 })],
      catalogue,
    );
    expect(plan.options).toEqual([]);
    expect(plan.noCommonApprover).toBe(true);
  });

  it('reports a level with nobody to forward to', () => {
    const plan = planForward([row({ schemeGroupKey: 'B20' })], CATALOGUE);
    expect(plan.unrouted).toEqual([{ typeName: 'VTR-1', level: 1 }]);
    expect(plan.noCommonApprover).toBe(false);
  });

  it('needs no Forward To for final approvals', () => {
    const plan = planForward([row({ schemeGroupKey: 'B15', level: 3, isFinal: true })], CATALOGUE);
    expect(plan.forwarding).toEqual([]);
    expect(plan.finals.length).toBe(1);
    expect(plan.options).toEqual([]);
  });
});

describe('defaultForwardTo', () => {
  it('picks the only person who can take the selection', () => {
    const plan = planForward([row({ schemeGroupKey: 'B15', level: 2 })], CATALOGUE);
    expect(defaultForwardTo(plan, [])).toBe('KhanS22');
  });

  it('picks the one remembered, if still allowed', () => {
    const plan = planForward([row()], CATALOGUE);
    expect(defaultForwardTo(plan, ['KhanS22'])).toBe('KhanS22');
    // The initiator is never picked, even if remembered.
    expect(defaultForwardTo(plan, ['AhmadN03'])).toBe('');
    expect(defaultForwardTo(plan, [])).toBe('');
  });
});

describe('rejectRecipients', () => {
  it('groups by initiator, most budgets first', () => {
    const recipients = rejectRecipients([
      row({ shellCode: 'A' }),
      row({ shellCode: 'B', initiatedBy: SARA }),
      row({ shellCode: 'C' }),
    ]);
    expect(recipients).toEqual([
      { name: 'Nada Ahmad', count: 2 },
      { name: 'Sara Khan', count: 1 },
    ]);
  });
});

describe('approvalChainOf', () => {
  it('shows the initiator, the signed levels and the caller as current', () => {
    const budget = row({
      level: 2,
      approvalSteps: [
        { level: 1, userId: UMAIR.userId, fullName: UMAIR.fullName, approvedOn: '2026-09-21T10:00:00' },
        { level: 2, userId: MUDASSIR.userId, fullName: MUDASSIR.fullName },
      ],
    });
    const chain = approvalChainOf(budget);
    expect(chain.map((step) => [step.role, step.name, step.status])).toEqual([
      ['Raised', 'Nada Ahmad', 'approved'],
      ['Level 1', 'Umair Awan', 'approved'],
      ['Level 2', 'Mudassir Hussain', 'pending'],
      ['Level 3 · final', 'Named when level 2 approves', 'waiting'],
    ]);
    expect(currentChainIndex(budget)).toBe(2);
  });
});

describe('outcomeNote', () => {
  it('names who a forwarded budget went to and at which level', () => {
    expect(
      outcomeNote({ shellCode: 'A', outcome: 'Forwarded', level: 1, notifiedUser: MUDASSIR, notification: 'Queued' }),
    ).toBe('To Mudassir Hussain at level 2. Emailed.');
  });

  it('explains a budget decided elsewhere', () => {
    expect(outcomeNote({ shellCode: 'A', outcome: 'NotPending', notification: 'None' })).toContain('Nothing was changed');
  });
});

describe('refusalOf', () => {
  function problem(status: number, errorCode: string, detail: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: { errorCode, detail, status } });
  }

  it('points a Forward To refusal at the picker and marks the list stale', () => {
    const refusal = refusalOf(
      problem(400, 'approve.budgets.forward_to_not_eligible', "Select 'Forward to' : X is not on the Forward To list"),
    );
    expect(refusal.target).toBe('forwardTo');
    expect(refusal.staleForwardTo).toBe(true);
    expect(refusal.message).toContain('Forward to');
    expect(refusal.toasted).toBe(false);
  });

  it('marks a lock conflict as retryable', () => {
    const refusal = refusalOf(problem(409, 'approve.budgets.busy', 'These budgets are being changed by someone else'));
    expect(refusal.retryable).toBe(true);
    expect(refusal.target).toBeNull();
  });

  it('knows a server fault was already toasted', () => {
    expect(refusalOf(new HttpErrorResponse({ status: 500 })).toasted).toBe(true);
  });
});
