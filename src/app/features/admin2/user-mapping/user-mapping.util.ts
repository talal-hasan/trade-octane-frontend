import {
  UserMappingRegionRoleRowResponse,
  UserMappingResponse,
  UserMappingWriteRequest,
} from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** One account in a roles-by-region drawer, with every region it holds. */
export interface RegionRoleAccount {
  userId: string;
  fullName: string;
  isActive: boolean | null;
  roleName: string | null;
  /** Region names, sorted. Empty when the account holds no region. */
  regions: string[];
}

/**
 * `/region-roles/users` repeats an account once per region, but role counts count it once —
 * so fold the rows by account. Case-insensitive, as the server's distinct count is.
 */
export function groupRowsByAccount(rows: readonly UserMappingRegionRoleRowResponse[]): RegionRoleAccount[] {
  const accounts = new Map<string, { account: RegionRoleAccount; regionCodes: Set<string> }>();
  for (const row of rows) {
    const key = row.userId.toLowerCase();
    let entry = accounts.get(key);
    if (!entry) {
      entry = {
        account: {
          userId: row.userId,
          fullName: row.fullName,
          isActive: row.userIsActive,
          roleName: row.roleName,
          regions: [],
        },
        regionCodes: new Set(),
      };
      accounts.set(key, entry);
    }
    const regionKey = row.regionCode?.toLowerCase();
    if (regionKey && !entry.regionCodes.has(regionKey)) {
      entry.regionCodes.add(regionKey);
      entry.account.regions.push(row.regionName || row.regionShortName || row.regionCode || '');
    }
  }
  return [...accounts.values()].map(({ account }) => ({
    ...account,
    regions: [...account.regions].sort(COLLATOR.compare),
  }));
}

/** Legacy "User Mapping" — `CPS_User_Mapping.aspx`, under Administration 2.0 (92). */
export const MENU_USER_MAPPING = 91;

export const USER_MAPPING_ROUTE = '/admin2/user-mapping';

/** The screen's two facets, one per legacy menu row: User Mapping (91) and Access Control (97). */
export const USER_MAPPING_TAB_MAPPING = 'mapping';
export const USER_MAPPING_TAB_ACCESS = 'access';

/** What the editor holds: one role, and sets of everything else. */
export interface MappingDraft {
  roleId: number | null;
  businessTypeIds: ReadonlySet<number>;
  regionCodes: ReadonlySet<string>;
  areaCodes: ReadonlySet<string>;
}

export const EMPTY_DRAFT: MappingDraft = {
  roleId: null,
  businessTypeIds: new Set<number>(),
  regionCodes: new Set<string>(),
  areaCodes: new Set<string>(),
};

export function draftFrom(mapping: UserMappingResponse): MappingDraft {
  return {
    roleId: mapping.role ? int(mapping.role.roleId) : null,
    businessTypeIds: new Set(mapping.businessTypes.map((type) => int(type.businessTypeId))),
    regionCodes: new Set(mapping.regions.map((region) => region.code)),
    areaCodes: new Set(mapping.areas.map((area) => area.code)),
  };
}

/**
 * The region an area code sits under: the code without its last `~` segment. The API
 * verified this against every catalogued area, and it still answers for held codes the
 * catalogue no longer contains.
 */
export function regionOfArea(areaCode: string): string {
  const separator = areaCode.lastIndexOf('~');
  return separator > 0 ? areaCode.slice(0, separator) : '';
}

const added = <T>(from: ReadonlySet<T>, to: ReadonlySet<T>): T[] => [...to].filter((value) => !from.has(value));

export interface MappingDiff {
  roleFrom: number | null;
  roleTo: number | null;
  roleChanged: boolean;
  businessTypesAdded: number[];
  businessTypesRemoved: number[];
  regionsAdded: string[];
  regionsRemoved: string[];
  areasAdded: string[];
  areasRemoved: string[];
  /** Every individual change, the role counting as one. */
  count: number;
}

export function diffMapping(saved: MappingDraft, draft: MappingDraft): MappingDiff {
  const diff = {
    roleFrom: saved.roleId,
    roleTo: draft.roleId,
    roleChanged: saved.roleId !== draft.roleId,
    businessTypesAdded: added(saved.businessTypeIds, draft.businessTypeIds),
    businessTypesRemoved: added(draft.businessTypeIds, saved.businessTypeIds),
    regionsAdded: added(saved.regionCodes, draft.regionCodes),
    regionsRemoved: added(draft.regionCodes, saved.regionCodes),
    areasAdded: added(saved.areaCodes, draft.areaCodes),
    areasRemoved: added(draft.areaCodes, saved.areaCodes),
  };
  return {
    ...diff,
    count:
      Number(diff.roleChanged) +
      diff.businessTypesAdded.length +
      diff.businessTypesRemoved.length +
      diff.regionsAdded.length +
      diff.regionsRemoved.length +
      diff.areasAdded.length +
      diff.areasRemoved.length,
  };
}

/** Areas in the draft whose region is not — they grant nothing, and the API refuses them. */
export function areasOutsideRegions(draft: MappingDraft): string[] {
  return [...draft.areaCodes].filter((code) => !draft.regionCodes.has(regionOfArea(code)));
}

export type RemovalStep =
  | { kind: 'role'; roleId: number }
  | { kind: 'businessType'; businessTypeId: number }
  | { kind: 'region'; regionCode: string }
  | { kind: 'area'; areaCode: string };

/**
 * How to save a draft.
 *
 * - `replace` — the usual case. The API's PUT sets the mapping to exactly the draft, in one
 *   transaction, but it takes only a complete mapping: a role and at least one of each list.
 * - `removals` — the draft takes a whole category away (no role left, say) and adds nothing.
 *   PUT cannot express that, so it is applied as the legacy grid's per-item removals. A
 *   region's removal already takes its areas, so those are not removed again.
 * - `blocked` — the draft adds something but is incomplete, or holds an area outside its
 *   regions. `reasons` says what to fix.
 */
export type SavePlan =
  | { kind: 'none' }
  | { kind: 'replace'; request: UserMappingWriteRequest }
  | { kind: 'removals'; steps: RemovalStep[] }
  | { kind: 'blocked'; reasons: string[] };

export function planSave(saved: MappingDraft, draft: MappingDraft): SavePlan {
  const diff = diffMapping(saved, draft);
  if (diff.count === 0) {
    return { kind: 'none' };
  }

  const outside = areasOutsideRegions(draft);
  const missing = [
    draft.roleId === null ? 'a role' : '',
    draft.businessTypeIds.size === 0 ? 'a business type' : '',
    draft.regionCodes.size === 0 ? 'a region' : '',
    draft.areaCodes.size === 0 ? 'an area' : '',
  ].filter(Boolean);

  if (missing.length === 0 && outside.length === 0) {
    return {
      kind: 'replace',
      request: {
        roleId: draft.roleId ?? 0,
        businessTypeIds: [...draft.businessTypeIds].sort((a, b) => a - b),
        regionCodes: [...draft.regionCodes].sort(),
        areaCodes: [...draft.areaCodes].sort(),
      },
    };
  }

  const addsSomething =
    (diff.roleChanged && diff.roleTo !== null) ||
    diff.businessTypesAdded.length > 0 ||
    diff.regionsAdded.length > 0 ||
    diff.areasAdded.length > 0;

  if (!addsSomething && outside.length === 0) {
    const regionsRemoved = new Set(diff.regionsRemoved);
    const steps: RemovalStep[] = [
      ...(diff.roleChanged && diff.roleFrom !== null ? [{ kind: 'role' as const, roleId: diff.roleFrom }] : []),
      ...diff.businessTypesRemoved.map((businessTypeId) => ({ kind: 'businessType' as const, businessTypeId })),
      ...diff.regionsRemoved.map((regionCode) => ({ kind: 'region' as const, regionCode })),
      ...diff.areasRemoved
        .filter((areaCode) => !regionsRemoved.has(regionOfArea(areaCode)))
        .map((areaCode) => ({ kind: 'area' as const, areaCode })),
    ];
    return { kind: 'removals', steps };
  }

  const reasons = [
    ...(missing.length > 0 ? [`Pick ${missing.join(', ')} — a mapping needs at least one of each.`] : []),
    ...(outside.length > 0
      ? [`${outside.length} ${outside.length === 1 ? 'area sits' : 'areas sit'} outside the selected regions.`]
      : []),
  ];
  return { kind: 'blocked', reasons };
}
