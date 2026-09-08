import { Role } from '../../../../core/models/role.model';

// ─── User types (KT Meeting 2 §3) ─────────────────────────────────────────────
// Three distinct provisioning paths, not three flavours of one form. Each has its own
// identity source, its own auth mechanism, and its own required fields — which is why
// the form switches its whole identity section on this value rather than toggling a
// couple of optional inputs.
//
//   ad          Company employee. Identity comes from Active Directory; the admin
//               searches the directory and picks a person. Nothing is typed.
//   distributor External. Credentials live in the Trade Octane DB. Identity comes from
//               the SAP distributor master list.
//   temporary   Role delegation. Credentials live in the Trade Octane DB, username
//               follows a naming convention, and an end date is mandatory — a nightly
//               job disables the account on that date and login re-checks it.
export type UserType = 'ad' | 'distributor' | 'temporary';

export const USER_TYPE_LABELS: Record<UserType, string> = {
  ad: 'Company user',
  distributor: 'Distributor user',
  temporary: 'Temporary / delegated',
};

export const USER_TYPE_HINTS: Record<UserType, string> = {
  ad: 'Identity is pulled from Active Directory. Sign-in uses their domain account.',
  distributor: 'External partner. Credentials are held in Trade Octane and issued by you.',
  temporary: 'Delegation cover. Auto-disables on the end date you set.',
};

export type UserStatus = 'active' | 'disabled' | 'pending';

// ─── Permission catalogue ─────────────────────────────────────────────────────
// The full permission surface, grouped by the module that owns it. This is the single
// source the permission matrix renders from, so adding a module here is all it takes to
// make it assignable — no form changes. Mirrors the legacy system's per-screen
// Initiate / Approve / View model (KT Meeting 2 §1).
export type PermissionAction = 'view' | 'create' | 'approve' | 'manage';

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'View',
  create: 'Initiate',
  approve: 'Approve',
  manage: 'Manage',
};

export interface PermissionModule {
  key: string;
  label: string;
  icon: string;
  /** Permission string per available action. Absent action = not applicable here. */
  actions: Partial<Record<PermissionAction, string>>;
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'budget',
    label: 'Budgets',
    icon: 'wallet',
    actions: { view: 'BUDGET_VIEW', create: 'BUDGET_CREATE', approve: 'BUDGET_APPROVE' },
  },
  {
    key: 'scheme',
    label: 'Schemes',
    icon: 'discount-2',
    actions: { view: 'SCHEME_VIEW', create: 'SCHEME_CREATE', approve: 'SCHEME_APPROVE' },
  },
  {
    key: 'claims',
    label: 'Claims',
    icon: 'file-invoice',
    actions: { view: 'CLAIMS_VIEW', approve: 'CLAIMS_APPROVE' },
  },
  {
    key: 'distribution',
    label: 'Distribution',
    icon: 'truck-delivery',
    actions: { view: 'DISTRIBUTION_VIEW', manage: 'DISTRIBUTION_MANAGE' },
  },
  {
    key: 'reports',
    label: 'Reports',
    icon: 'chart-bar',
    actions: { view: 'REPORTS_VIEW' },
  },
  {
    key: 'admin',
    label: 'Administration',
    icon: 'users-group',
    actions: { manage: 'ADMIN_USER_MANAGE', view: 'ADMIN_MASTER_DATA' },
  },
];

/** Every permission string in the catalogue, flattened. */
export const ALL_PERMISSIONS: string[] = PERMISSION_MODULES.flatMap((module) =>
  Object.values(module.actions),
);

// ─── Access templates ─────────────────────────────────────────────────────────
// The click-saver. Borrowed from AWS IAM Identity Center's permission sets and Entra's
// group-assigned templates: instead of ticking ~14 permission boxes, the admin picks the
// job. One click stamps roles + permissions + a sensible default scope, and everything
// stays editable afterwards — the template is a starting point, not a lock.
//
// These are seeded from the real role list captured in KT Meeting 2 §1.
export interface AccessTemplate {
  key: string;
  label: string;
  description: string;
  icon: string;
  roles: Role[];
  permissions: string[];
  /** Applies to these user types only — a distributor can't be given an RSM template. */
  appliesTo: UserType[];
}

export const ACCESS_TEMPLATES: AccessTemplate[] = [
  {
    key: 'rsm',
    label: 'Regional Sales Manager',
    description: 'Raises budgets and schemes, approves claims in their regions.',
    icon: 'wallet',
    roles: ['RSM'],
    permissions: [
      'BUDGET_VIEW',
      'BUDGET_CREATE',
      'SCHEME_VIEW',
      'SCHEME_CREATE',
      'CLAIMS_VIEW',
      'CLAIMS_APPROVE',
      'DISTRIBUTION_VIEW',
      'REPORTS_VIEW',
    ],
    appliesTo: ['ad', 'temporary'],
  },
  {
    key: 'rmc',
    label: 'Regional Marketing Coordinator',
    description: 'Initiates schemes, read-only on budgets and claims.',
    icon: 'discount-2',
    roles: ['RMC'],
    permissions: ['BUDGET_VIEW', 'SCHEME_VIEW', 'SCHEME_CREATE', 'CLAIMS_VIEW', 'REPORTS_VIEW'],
    appliesTo: ['ad', 'temporary'],
  },
  {
    key: 'trade-category',
    label: 'Trade Category Manager',
    description: 'Owns scheme design and approval across assigned brands.',
    icon: 'discount-2',
    roles: ['TRADE_CATEGORY'],
    permissions: [
      'BUDGET_VIEW',
      'SCHEME_VIEW',
      'SCHEME_CREATE',
      'SCHEME_APPROVE',
      'REPORTS_VIEW',
    ],
    appliesTo: ['ad', 'temporary'],
  },
  {
    key: 'head-of-sales',
    label: 'Head of Sales',
    description: 'Final approver on budgets, schemes and claims nationally.',
    icon: 'circle-check',
    roles: ['HEAD_OF_SALES'],
    permissions: [
      'BUDGET_VIEW',
      'BUDGET_APPROVE',
      'SCHEME_VIEW',
      'SCHEME_APPROVE',
      'CLAIMS_VIEW',
      'CLAIMS_APPROVE',
      'DISTRIBUTION_VIEW',
      'REPORTS_VIEW',
    ],
    appliesTo: ['ad', 'temporary'],
  },
  {
    key: 'mis',
    label: 'MIS / Reporting',
    description: 'Read-only across every module. No approval rights.',
    icon: 'chart-bar',
    roles: ['MIS'],
    permissions: [
      'BUDGET_VIEW',
      'SCHEME_VIEW',
      'CLAIMS_VIEW',
      'DISTRIBUTION_VIEW',
      'REPORTS_VIEW',
    ],
    appliesTo: ['ad', 'temporary'],
  },
  {
    key: 'distributor',
    label: 'Distributor (standard)',
    description: 'Raises off-invoice claims and views their own distribution data.',
    icon: 'truck-delivery',
    roles: ['DISTRIBUTOR'],
    permissions: ['CLAIMS_VIEW', 'DISTRIBUTION_VIEW'],
    appliesTo: ['distributor'],
  },
  {
    key: 'admin',
    label: 'Administrator',
    description: 'Full access including user and master-data administration.',
    icon: 'settings',
    roles: ['ADMIN'],
    permissions: ALL_PERMISSIONS,
    appliesTo: ['ad'],
  },
];

// ─── Reference data ───────────────────────────────────────────────────────────
export const REGIONS = [
  'Punjab-North',
  'Punjab-South',
  'Sindh',
  'KPK',
  'Balochistan',
] as const;

export const BRANDS = ['Olpers', 'Tarang', 'Nurpur'] as const;

export const BUSINESS_TYPES = ['Dairy (GT)', 'FSD', 'Modern Trade'] as const;

// Structured city list. The legacy system used a free-text city field on distributor
// creation, called out in KT §"Known Gaps" as a data-quality problem — this closes it.
export const CITIES: Record<string, string[]> = {
  'Punjab-North': ['Lahore', 'Gujranwala', 'Sialkot', 'Faisalabad'],
  'Punjab-South': ['Multan', 'Bahawalpur', 'Sahiwal', 'Dera Ghazi Khan'],
  Sindh: ['Karachi', 'Hyderabad', 'Sukkur', 'Larkana'],
  KPK: ['Peshawar', 'Abbottabad', 'Mardan', 'Swat'],
  Balochistan: ['Quetta', 'Gwadar', 'Sibi'],
};

// ─── Entities ─────────────────────────────────────────────────────────────────

/** A person in the corporate directory, as returned by the AD lookup. */
export interface DirectoryPerson {
  employeeId: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  /** Home region on the AD record — pre-fills scope so the admin usually confirms, not picks. */
  region: string;
}

/** A distributor from the SAP master list. */
export interface DistributorRecord {
  code: string;
  name: string;
  businessType: string;
  region: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  userType: UserType;
  status: UserStatus;
  roles: Role[];
  permissions: string[];
  regions: string[];
  brands: string[];
  /** Temporary users only — the date the nightly job disables this account. */
  endDate?: string;
  /** Distributor users only. */
  distributorCode?: string;
  city?: string;
  lastActive?: string;
  createdAt: string;
}

/** Payload from the provisioning form. The service derives id, status and createdAt. */
export interface NewUserInput {
  userType: UserType;
  name: string;
  email: string;
  roles: Role[];
  permissions: string[];
  regions: string[];
  brands: string[];
  endDate?: string;
  distributorCode?: string;
  city?: string;
}
