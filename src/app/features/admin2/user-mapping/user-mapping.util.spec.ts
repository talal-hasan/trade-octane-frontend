import { UserMappingRegionRoleRowResponse } from '../../../core/api/admin2.models';
import {
  MappingDraft,
  areasOutsideRegions,
  diffMapping,
  groupRowsByAccount,
  planSave,
  regionOfArea,
} from './user-mapping.util';

function regionRow(userId: string, regionCode: string | null, regionName = ''): UserMappingRegionRoleRowResponse {
  return {
    userId,
    fullName: userId,
    email: '',
    userIsActive: true,
    roleId: 4,
    roleName: 'RSM',
    regionCode,
    regionShortName: '',
    regionName,
    regionExists: regionCode !== null,
    regionIsActive: true,
  };
}

describe('groupRowsByAccount', () => {
  it('lists an account once, with every region it holds, in the order accounts first appear', () => {
    const accounts = groupRowsByAccount([
      regionRow('Usman.Sherwani', 'N', 'FSD North'),
      regionRow('safwan.munir', 'N', 'FSD North'),
      regionRow('Usman.Sherwani', 'S', 'FSD South'),
      regionRow('Usman.Sherwani', 'C', 'FSD Central'),
    ]);

    expect(accounts.map((account) => [account.userId, account.regions])).toEqual([
      ['Usman.Sherwani', ['FSD Central', 'FSD North', 'FSD South']],
      ['safwan.munir', ['FSD North']],
    ]);
  });

  it('matches accounts and regions ignoring case, as the server count does', () => {
    const accounts = groupRowsByAccount([regionRow('Usman.Sherwani', 'N', 'FSD North'), regionRow('usman.sherwani', 'n', 'FSD North')]);

    expect(accounts.length).toBe(1);
    expect(accounts[0].regions).toEqual(['FSD North']);
  });

  it('gives an account with no region an empty region list, and names an unnamed region by its code', () => {
    const accounts = groupRowsByAccount([regionRow('no.region', null), regionRow('unknown', 'X9')]);

    expect(accounts.map((account) => account.regions)).toEqual([[], ['X9']]);
  });
});

const NORTH = '1000~4000~1000~0040~0002~0002';
const SOUTH = '1000~4000~1000~0040~0001~0001';
const LAHORE = `${NORTH}~0010`;
const MULTAN = `${NORTH}~0011`;
const KARACHI = `${SOUTH}~0020`;

function draft(roleId: number | null, types: number[], regions: string[], areas: string[]): MappingDraft {
  return {
    roleId,
    businessTypeIds: new Set(types),
    regionCodes: new Set(regions),
    areaCodes: new Set(areas),
  };
}

const SAVED = draft(4, [1, 2], [NORTH], [LAHORE, MULTAN]);

describe('regionOfArea', () => {
  it('drops the last segment of the path', () => {
    expect(regionOfArea(LAHORE)).toBe(NORTH);
    expect(regionOfArea('no-separator')).toBe('');
  });
});

describe('diffMapping', () => {
  it('counts each change once, the role as one', () => {
    const diff = diffMapping(SAVED, draft(5, [1, 3], [NORTH, SOUTH], [LAHORE, KARACHI]));
    expect(diff.roleChanged).toBe(true);
    expect(diff.businessTypesAdded).toEqual([3]);
    expect(diff.businessTypesRemoved).toEqual([2]);
    expect(diff.regionsAdded).toEqual([SOUTH]);
    expect(diff.areasRemoved).toEqual([MULTAN]);
    expect(diff.count).toBe(6);
  });
});

describe('planSave', () => {
  it('does nothing for an unchanged draft', () => {
    expect(planSave(SAVED, draft(4, [2, 1], [NORTH], [MULTAN, LAHORE]))).toEqual({ kind: 'none' });
  });

  it('replaces a complete mapping in one write', () => {
    const plan = planSave(SAVED, draft(5, [2, 1], [NORTH], [MULTAN, LAHORE]));
    expect(plan).toEqual({
      kind: 'replace',
      request: { roleId: 5, businessTypeIds: [1, 2], regionCodes: [NORTH], areaCodes: [LAHORE, MULTAN] },
    });
  });

  it('applies a mapping emptied of a whole category as removals, skipping areas a region removal takes', () => {
    const plan = planSave(SAVED, draft(null, [1, 2], [], []));
    expect(plan).toEqual({
      kind: 'removals',
      steps: [
        { kind: 'role', roleId: 4 },
        { kind: 'region', regionCode: NORTH },
      ],
    });
  });

  it('blocks an incomplete mapping that also adds something', () => {
    const plan = planSave(SAVED, draft(null, [1, 2, 3], [NORTH], [LAHORE]));
    expect(plan.kind).toBe('blocked');
  });

  it('blocks an area left outside the selected regions', () => {
    const outside = draft(4, [1], [SOUTH], [LAHORE, KARACHI]);
    expect(areasOutsideRegions(outside)).toEqual([LAHORE]);
    expect(planSave(SAVED, outside)).toEqual({ kind: 'blocked', reasons: ['1 area sits outside the selected regions.'] });
  });
});
