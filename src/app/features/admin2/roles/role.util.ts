import { Octane2RoleResponse } from '../../../core/api/admin2.models';

/** Legacy "Create Role" — `CPS_Role.aspx`, under Administration 2.0 (92). */
export const MENU_CREATE_ROLE_2 = 88;

export const ROLES_2_ROUTE = '/admin2/roles';

/** The legacy validators' rule, which the API still applies to both text fields. */
export const ROLE_TEXT_PATTERN = /^[A-Za-z0-9_ ]+$/;
export const ROLE_TEXT_MAX = 100;

export type RoleFlagKey = 'allowWbsSp' | 'wbsSpVisibility' | 'canUpdateAmount' | 'isReadDetail';

export interface RoleFlag {
  key: RoleFlagKey;
  /** The legacy checkbox label, verbatim, so someone trained on the old screen finds it. */
  legacyLabel: string;
  /** Column header — the grid has four of these side by side. */
  shortLabel: string;
  /** What turning it on actually does, as far as the database and legacy source show. */
  effect: string;
  /** Nothing reads the column today. Said out loud, so nobody expects it to do something. */
  inert: boolean;
}

export const ROLE_FLAGS: readonly RoleFlag[] = [
  {
    key: 'allowWbsSp',
    legacyLabel: 'Allow Input WBS/Spend proposal',
    shortLabel: 'WBS input',
    effect: 'Holders can enter the WBS / spend proposal on claim, claim report and payment recovery details.',
    inert: false,
  },
  {
    key: 'wbsSpVisibility',
    legacyLabel: 'Make WBS/Spend proposal visible',
    shortLabel: 'WBS visible',
    effect: 'Holders see the WBS / spend proposal on those same screens.',
    inert: false,
  },
  {
    key: 'canUpdateAmount',
    legacyLabel: 'Can Update Amount',
    shortLabel: 'Update amount',
    effect: 'Stored with the role, but no screen or procedure reads it today.',
    inert: true,
  },
  {
    key: 'isReadDetail',
    legacyLabel: 'Is Read Detail',
    shortLabel: 'Read detail',
    effect: 'Stored with the role, but no screen or procedure reads it today.',
    inert: true,
  },
];

/** Request member names, as `changedFields` reports them, in words. */
export const ROLE_FIELD_LABELS: Readonly<Record<string, string>> = {
  roleName: 'Role abbreviation',
  roleDescription: 'Description',
  allowWbsSp: 'WBS input',
  wbsSpVisibility: 'WBS visible',
  canUpdateAmount: 'Update amount',
  isReadDetail: 'Read detail',
  status: 'Status',
};

/** "3 users", "1 menu grant" — counts read as words, not a column of bare numbers. */
export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-PK')} ${count === 1 ? one : many}`;
}

/** The label a role goes by in messages: "ADMIN (role 13)". */
export function roleLabel(role: Pick<Octane2RoleResponse, 'roleName' | 'roleId'>): string {
  return `${role.roleName} (role ${role.roleId})`;
}
