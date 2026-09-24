import { HttpErrorResponse } from '@angular/common/http';

import { TradeOfferCriterionSelection, TradeOfferScheme } from '../../../core/api/initiate.models';
import {
  approvalChainOf,
  criteriaRequirements,
  daysIn,
  followingToDate,
  formatMoney,
  formatPeriod,
  joinedLength,
  mechanicsOutdated,
  parseIsoDate,
  periodPresets,
  refusalOf,
  sequenceIdIn,
  slabTotalDiscount,
  stepOfIssue,
  toIsoDate,
} from './trade-offer.util';

function selection(criterion: string, codes: string[], operator: 'Include' | 'Exclude' = 'Include'): TradeOfferCriterionSelection {
  return { criterion, dimension: criterion, operator, values: codes.map((code) => ({ code, name: code })) };
}

function scheme(overrides: Partial<TradeOfferScheme> = {}): TradeOfferScheme {
  return {
    sequenceId: '183577',
    processCode: '002',
    schemeId: 'Pro-200',
    description: 'South Procal 200 All',
    fromDate: '2026-08-06',
    toDate: '2026-08-31',
    discountType: { code: '01', name: 'Normal Discount' },
    schemeType: { code: 'T', name: 'Trade Offer' },
    claimType: { code: 'TO', name: 'Trade Offer' },
    claimPercentage: 100,
    status: 'Draft',
    isEditable: true,
    slabs: [
      { serialNo: 1, fromQuantity: 4.8, toQuantity: 99999, discountValue: 24, purchaseLimit: 0, forecastLimit: 4142.4, forEvery: 4.8 },
    ],
    criteria: [],
    mechanics: null,
    approvalSteps: [],
    ...overrides,
  };
}

describe('dates', () => {
  it('reads and writes wire dates as local calendar dates', () => {
    const date = parseIsoDate('2026-08-10');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(7);
    expect(date?.getDate()).toBe(10);
    expect(toIsoDate(date!)).toBe('2026-08-10');
    expect(parseIsoDate('2026-08-10T00:00:00')?.getDate()).toBe(10);
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('not a date')).toBeNull();
  });

  it('keeps a To Date inside the From Date month, otherwise moves it to the month end', () => {
    const from = new Date(2026, 8, 24);
    expect(followingToDate(from, new Date(2026, 8, 28))).toEqual(new Date(2026, 8, 28));
    expect(followingToDate(from, new Date(2026, 8, 20))).toEqual(new Date(2026, 8, 30));
    expect(followingToDate(from, new Date(2026, 9, 5))).toEqual(new Date(2026, 8, 30));
    expect(followingToDate(from, null)).toEqual(new Date(2026, 8, 30));
  });

  it('offers the rest of this month and the whole of next', () => {
    const [rest, next] = periodPresets(new Date(2026, 11, 24, 15, 30));
    expect(rest.range).toEqual({ from: new Date(2026, 11, 24), to: new Date(2026, 11, 31) });
    expect(next.label).toBe('All of January');
    expect(next.range).toEqual({ from: new Date(2027, 0, 1), to: new Date(2027, 0, 31) });
  });

  it('counts both ends of a range and names the month once', () => {
    expect(daysIn({ from: new Date(2026, 7, 10), to: new Date(2026, 7, 31) })).toBe(22);
    expect(formatPeriod('2026-08-10', '2026-08-31')).toBe('10 – 31 Aug 2026');
    expect(formatPeriod(null, null)).toBe('—');
  });
});

describe('slab and mechanics', () => {
  it('computes the total discount as discount ÷ for every × forecast', () => {
    expect(slabTotalDiscount(24, 4.8, 4142.4)).toBe(20712);
    expect(slabTotalDiscount(38, 4.32, 2074)).toBe(18243.52);
    expect(slabTotalDiscount(24, 0, 100)).toBeNull();
    expect(slabTotalDiscount(null, 4.8, 100)).toBeNull();
  });

  it('calls saved mechanics out of date once the slab no longer gives their discount', () => {
    const figures = {
      grossProfitPerLitre: 108,
      totalDiscount: 20712,
      activatedVolume: 4142.4,
      baselineVolume: 2899.68,
      postSchemeDip: 2692.56,
      incrementalVolume: 1035.6,
      incrementalGrossProfit: 111844.8,
      incrementalProfit: 91132.8,
      roi: 440,
      uplift: 35.71,
    };
    const mechanics = { budgetShellCode: 'S1', figures, exceedsAvailableBudget: false, database: { code: 'S', name: 'Salesflo' } };
    expect(mechanicsOutdated(scheme({ mechanics }))).toBe(false);
    expect(mechanicsOutdated(scheme({ mechanics: { ...mechanics, figures: { ...figures, totalDiscount: '20712.00' } } }))).toBe(false);
    expect(mechanicsOutdated(scheme({ mechanics: { ...mechanics, figures: { ...figures, activatedVolume: 4000 } } }))).toBe(true);
    expect(mechanicsOutdated(scheme())).toBe(false);
  });

  it('shows paise only when there are any', () => {
    expect(formatMoney(20712)).toBe('PKR 20,712');
    expect(formatMoney(18243.52)).toBe('PKR 18,243.52');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('criteria', () => {
  it('states the three rules Check for Approval applies', () => {
    const ready = criteriaRequirements([selection('GEO_LEVEL6', ['1000~4000']), selection('MASTER_SKU', ['E79', 'E43'])]);
    expect(ready).toEqual(
      expect.objectContaining({ regionOk: true, masterSkuOk: true, brandOk: true, regionCode: '1000~4000', masterSkuCount: 2 }),
    );

    const wrong = criteriaRequirements([selection('geo_level6', ['A', 'B']), selection('PROD_LEVEL6', ['X'])]);
    expect(wrong.regionOk).toBe(false);
    expect(wrong.regionCount).toBe(2);
    expect(wrong.regionCode).toBeNull();
    expect(wrong.masterSkuOk).toBe(false);
    expect(wrong.brandOk).toBe(false);
  });

  it('measures codes as stored, joined with ~~', () => {
    expect(joinedLength([])).toBe(0);
    expect(joinedLength(['001'])).toBe(3);
    expect(joinedLength(['001', '007'])).toBe(8);
  });
});

describe('approval', () => {
  it('points each issue at the part that fixes it', () => {
    expect(stepOfIssue('single_region')).toBe('criteria');
    expect(stepOfIssue('initiate.trade_offers.mechanics_outdated')).toBe('mechanics');
    expect(stepOfIssue('slabs_required')).toBe('slab');
    expect(stepOfIssue('no_approver')).toBeNull();
  });

  it('marks the first unsigned level as the one holding the scheme', () => {
    const { steps, current } = approvalChainOf(
      scheme({
        approvalSteps: [
          { level: 1, userId: 'a', fullName: 'Ahmed', approvedOn: '2026-08-08T10:00:00' },
          { level: '2', userId: 'b', fullName: 'Bushra', approvedOn: null },
        ],
      }),
    );
    expect(current).toBe(1);
    expect(steps.map((step) => step.status)).toEqual(['approved', 'pending', 'waiting']);
    expect(steps[2].name).toBe('Named when level 2 approves');
  });

  it('reads the earlier sequence id out of a double-submit refusal', () => {
    expect(sequenceIdIn('New Scheme is added with Sequence ID = 183578 moments ago with exactly these details')).toBe('183578');
    const refusal = refusalOf(
      new HttpErrorResponse({
        status: 409,
        error: { detail: 'Only one slab can be defined', errorCode: 'initiate.trade_offers.slab_exists' },
      }),
    );
    expect(refusal).toEqual({ code: 'slab_exists', message: 'Only one slab can be defined', status: 409, toasted: false });
  });
});
