import { HttpErrorResponse } from '@angular/common/http';

import {
  BudgetCatalogueResponse,
  BudgetSchemeTypeResponse,
  BudgetShellResponse,
} from '../../../core/api/master-data.models';
import {
  approvalChainOf,
  currentChainIndex,
  daysSince,
  findSchemeType,
  periodLabel,
  periodState,
  periodWindow,
  refusalOf,
  regionDescription,
  shellCodeIn,
  stageLabel,
} from './create-budget.util';

function type(id: number, name: string, backDated: number, earliest: [number, number]): BudgetSchemeTypeResponse {
  return {
    schemeTypeId: id,
    name,
    schemeGroup: name,
    backDatedMonths: backDated,
    earliestPeriod: { year: earliest[0], month: earliest[1] },
  };
}

const TRADE_OFFER = type(1, 'Trade Offer', 12, [2025, 9]);
const FMR = type(6, 'FMR', 0, [2026, 9]);

const CATALOGUE: BudgetCatalogueResponse = {
  currentPeriod: { year: 2026, month: 9 },
  latestPeriod: { year: 2028, month: 12 },
  years: [2025, 2026, 2027, 2028],
  months: [],
  regions: [],
  criteria: [],
  schemeGroups: [
    { schemeGroupKey: 'B15', name: 'DBDP', schemeTypes: [FMR] },
    // Wire integers may arrive as strings.
    { schemeGroupKey: 'TO', name: 'Trade Offer', schemeTypes: [{ ...TRADE_OFFER, schemeTypeId: '1' }] },
  ],
};

function shell(overrides: Partial<BudgetShellResponse>): BudgetShellResponse {
  return {
    shellCode: '05-39896-28/2026-8',
    serialNumber: 39896,
    year: 2026,
    month: 8,
    monthName: 'AUG',
    regionCode: 'r',
    regionName: 'South',
    criterion: 'PROD_LEVEL6',
    dimension: 'Brand',
    value: 'v',
    valueName: 'Olpers',
    schemeTypeId: 1,
    schemeType: 'Trade Offer',
    schemeGroup: 'Trade Offer',
    description: 'd',
    amount: 100000,
    originalAmount: 100000,
    stage: 'AwaitingLevel1',
    approvalSteps: [],
    ...overrides,
  };
}

describe('periodWindow', () => {
  it('runs from the current month to the last period, even for a type that allows back-dating', () => {
    expect(periodWindow(CATALOGUE)).toEqual({
      earliest: { year: 2026, month: 9 },
      latest: { year: 2028, month: 12 },
    });
  });

  it('is unknown until the catalogue loads', () => {
    expect(periodWindow(null)).toBeNull();
  });
});

describe('periodState', () => {
  const window = periodWindow(CATALOGUE);

  it('rules out a month before the window and after it, and keeps both ends', () => {
    expect(periodState({ year: 2026, month: 8 }, window)).toBe('before');
    expect(periodState({ year: 2026, month: 9 }, window)).toBe('open');
    expect(periodState({ year: 2028, month: 12 }, window)).toBe('open');
    expect(periodState({ year: 2029, month: 1 }, window)).toBe('after');
  });
});

describe('findSchemeType', () => {
  it('finds a type by id across groups, whether the id arrives as a number or a string', () => {
    expect(findSchemeType(CATALOGUE, 1)?.group.schemeGroupKey).toBe('TO');
    expect(findSchemeType(CATALOGUE, 6)?.type.name).toBe('FMR');
    expect(findSchemeType(CATALOGUE, 99)).toBeNull();
  });
});

describe('regionDescription', () => {
  it('appends the region, as budgets raised for several regions are named', () => {
    expect(regionDescription(' Olpers Ittehad Plan_Aug26 ', 'Islamabad', true)).toBe('Olpers Ittehad Plan_Aug26_Islamabad');
  });

  it('leaves the description alone with the suffix off, or while it is empty', () => {
    expect(regionDescription('Plan', 'South', false)).toBe('Plan');
    expect(regionDescription('  ', 'South', true)).toBe('');
  });
});

describe('periodLabel', () => {
  it('reads as a short month and year', () => {
    expect(periodLabel({ year: 2026, month: 8 })).toBe('Aug 2026');
    expect(periodLabel(null)).toBe('');
  });
});

describe('approval chain', () => {
  it('shows the signed levels, the one waiting, and the levels not named yet', () => {
    const steps = approvalChainOf(
      shell({
        stage: 'AwaitingLevel2',
        approvalSteps: [
          { level: 1, userId: 'a', fullName: 'Asad', approvedOn: '2026-08-02T10:00:00' },
          { level: '2', userId: 'b', fullName: 'Bilal' },
        ],
      }),
    );
    expect(steps.map((step) => step.status)).toEqual(['approved', 'pending', 'waiting']);
    expect(steps[2].name).toBe('Named when level 2 approves');
  });

  it('points at the waiting level, and past the end once approved', () => {
    expect(currentChainIndex(shell({ stage: 'AwaitingLevel3' }))).toBe(2);
    expect(currentChainIndex(shell({ stage: 'Approved' }))).toBe(3);
  });

  it('has no chain for a budget that waits on nobody', () => {
    expect(approvalChainOf(shell({ stage: 'ReturnedToInitiator' }))).toEqual([]);
    expect(stageLabel('ReturnedToInitiator')).toBe('Returned to you');
  });
});

describe('daysSince', () => {
  it('counts whole days, and nothing for a missing date', () => {
    expect(daysSince('2026-09-20T09:00:00Z', new Date('2026-09-23T08:00:00Z'))).toBe(2);
    expect(daysSince(null)).toBeNull();
  });
});

describe('refusalOf', () => {
  function refusal(status: number, errorCode: string, detail: string): HttpErrorResponse {
    return new HttpErrorResponse({ status, error: { errorCode, detail, title: 'x' } });
  }

  it('lets the rest of a batch carry on when only this region was refused', () => {
    const result = refusalOf(refusal(400, 'master_data.budgets.region_inactive', 'Please Select Region: North is inactive.'));
    expect(result).toMatchObject({ code: 'region_inactive', field: 'region', lineOnly: true });
    expect(result.message).toContain('North is inactive');
  });

  it('stops the batch on a refusal every region would get', () => {
    expect(refusalOf(refusal(400, 'master_data.budgets.back_dated', 'Selected Month is Lesser…'))).toMatchObject({
      field: 'period',
      lineOnly: false,
    });
    expect(refusalOf(refusal(400, 'master_data.budgets.approver_not_eligible', 'x')).field).toBe('forwardTo');
  });

  it('reads the existing shell out of a double submit', () => {
    const detail = 'Budget Shell 05-39896-28/2026-8 was just created with exactly these details, so this submission was not saved again.';
    expect(refusalOf(refusal(409, 'master_data.budgets.duplicate_submit', detail))).toMatchObject({
      lineOnly: true,
      existingShellCode: '05-39896-28/2026-8',
    });
    expect(shellCodeIn('nothing here')).toBeNull();
  });
});
