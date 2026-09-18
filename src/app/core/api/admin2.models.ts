// ─────────────────────────────────────────────────────────────────────────────
// Administration 2.0 contracts — the CPS_* screens, served from `/api/v1/admin2/...`.
//
// Kept apart from admin.models.ts on purpose. The 2.0 screens edit Promo_Management_2, a
// different user population with differently shaped tables, so a 2.0 type that happens
// to share a name with a 1.0 one ("role", "access control") is not the same thing and
// must not be importable as if it were.
//
// Wire integers are `ApiInt` and read through `int()`, as everywhere else — see
// api.types.ts for why.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiInt } from './api.types';

// ─── Create Distributor (MenuID 87, CPS_CreateDistributor.aspx) ─────────────

/** Which accounts `GET /admin2/distributors` returns. The server defaults to `Active`. */
export type DistributorStatusFilter = 'Active' | 'Inactive' | 'All';

/**
 * A distributor's sign-in account, without its password. Nothing on this API returns the
 * password — legacy decrypted it back into the Edit form.
 */
export interface DistributorAccountResponse {
  /** The master's distributor code. Also the sign-in name, and not editable. */
  distributorId: string;
  /** Taken from the distributor master at creation. Not editable. */
  name: string;
  contact: string;
  city: string;
  regionCode: string;
  /** Empty when the stored code no longer resolves to a region. */
  region: string;
  areaCode: string;
  area: string;
  territoryCode: string;
  /** Empty when the stored code no longer resolves to a territory. */
  territory: string;
  businessTypeId: ApiInt;
  businessType: string;
  distributorEmail: string;
  kpoEmail: string;
  /** The password sign-in admits only active distributors. */
  isActive: boolean;
  /** Set alongside `isActive = false` by Deactivate. Nothing at sign-in reads it. */
  isDeleted: boolean;
  /**
   * Honoured by the **SSO** sign-in only — the password sign-in's lock check is commented
   * out in the legacy procedure. Deactivating is what stops every sign-in.
   */
  isLocked: boolean;
  /** Set by the forgotten-password flow: they must update their profile at next sign-in. */
  passwordChangeRequired: boolean;
  createdAt: string | null;
  passwordSetAt: string | null;
}

/** A distributor in the master with no account yet — one choice in the Distributor picker. */
export interface DistributorCandidateResponse {
  distributorId: string;
  name: string;
  /** The master's own region text, for orientation. Not a location code. */
  region: string;
  /**
   * The master's resignation date, as stored. Placeholder years (2030, 2050) mean "still
   * working"; a past date means the distributor resigned. Legacy offered every row.
   */
  resignationDate: string | null;
}

export interface DistributorBusinessTypeResponse {
  businessTypeId: ApiInt;
  name: string;
}

export interface DistributorTerritoryResponse {
  code: string;
  name: string;
}

export interface DistributorAreaResponse {
  code: string;
  name: string;
  territories: DistributorTerritoryResponse[];
}

export interface DistributorRegionResponse {
  code: string;
  name: string;
  areas: DistributorAreaResponse[];
}

/** The form's pickers in one call: business types, and active regions → areas → territories. */
export interface DistributorAccountCatalogueResponse {
  businessTypes: DistributorBusinessTypeResponse[];
  regions: DistributorRegionResponse[];
}

/** `POST /admin2/distributors`. Every member is required. */
export interface CreateDistributorRequest {
  distributorId: string;
  businessTypeId: number;
  regionCode: string;
  areaCode: string;
  territoryCode: string;
  city: string;
  contact: string;
  password: string;
  distributorEmail: string;
  kpoEmail: string;
}

/**
 * `PUT /admin2/distributors/{distributorId}`. Every member except `password` is required;
 * omit `password` to keep the current one.
 */
export type UpdateDistributorRequest = Omit<CreateDistributorRequest, 'distributorId' | 'password'> & {
  password?: string;
};

/**
 * What a write changed, and the account afterwards. An empty `changedFields` means the
 * server wrote and logged nothing — the account was already in that state.
 */
export interface DistributorAccountWriteResponse {
  distributor: DistributorAccountResponse;
  changedFields: string[];
}

// ─── Create Role (MenuID 88, CPS_Role.aspx) ─────────────────────────────────

/** Which roles `GET /admin2/roles` returns. The server defaults to `Active`. */
export type Octane2RoleStatusFilter = 'Active' | 'Inactive' | 'All';

/**
 * One role from Promo_Management_2.dbo.Roles, with what depends on it. A different table
 * from the 1.0 role catalogue: four claim flags, and no menu seeding on create.
 *
 * The flags are nullable bits in the database; NULL has always behaved as false, and is
 * reported as false.
 */
export interface Octane2RoleResponse {
  roleId: ApiInt;
  /** The legacy "Role Abbreviation" — what every role picker shows. */
  roleName: string;
  roleDescription: string;
  /** "Allow Input WBS/Spend proposal". Read by the claim, claim report and payment recovery details. */
  allowWbsSp: boolean;
  /** "Make WBS/Spend proposal visible". Same readers. */
  wbsSpVisibility: boolean;
  /** "Can Update Amount". Stored, but nothing reads it today. */
  canUpdateAmount: boolean;
  /** "Is Read Detail". Stored, but nothing reads it today. */
  isReadDetail: boolean;
  /**
   * Deactivating revokes nothing — no legacy procedure reads the column. It only hides the
   * role from the default list and refuses it for new user mappings, approval hierarchy
   * steps and authority levels.
   */
  isActive: boolean;
  /** Promo_2 accounts holding the role. */
  userCount: ApiInt;
  activeUserCount: ApiInt;
  menuGrantCount: ApiInt;
  /** Claim approval routes the role sits in. */
  approvalHierarchyLevelCount: ApiInt;
  authorityLevelCount: ApiInt;
}

/**
 * Body of both `POST` and `PUT`. Create requires the two text fields (omitted flags are
 * false); update requires every member, so no flag can be reset by omission.
 */
export interface Octane2RoleWriteRequest {
  roleName: string;
  roleDescription: string;
  allowWbsSp: boolean;
  wbsSpVisibility: boolean;
  canUpdateAmount: boolean;
  isReadDetail: boolean;
}

/** `changedFields` empty: the server wrote and logged nothing. */
export interface Octane2RoleWriteResponse {
  role: Octane2RoleResponse;
  changedFields: string[];
}

// ─── Level Of Authorities (MenuID 89, CPS_Level_Of_Authorities.aspx) ─────────

/**
 * One row of Promo_Management_2.dbo.Authority_Level: the claim amount at which a role
 * joins the approval cycle of a claim of this business type and claim nature.
 *
 * How `Proc_Claim_Create` reads it: the role joins when the claim amount is between the two
 * amounts, **or above `toAmount`**, or when both are 0. So in practice a role joins every
 * claim from `fromAmount` upwards — `toAmount` never keeps it out.
 *
 * A name is empty when its id no longer resolves; nothing constrains the ids.
 */
export interface LevelOfAuthorityResponse {
  levelOfAuthorityId: ApiInt;
  businessTypeId: ApiInt;
  businessType: string;
  claimNatureId: ApiInt;
  claimNature: string;
  roleId: ApiInt;
  roleName: string;
  /** Whole PKR. */
  fromAmount: ApiInt;
  toAmount: ApiInt;
}

export interface LevelOfAuthorityOptionResponse {
  id: ApiInt;
  name: string;
}

/** Every business type, claim nature and Administration 2.0 role — inactive roles included. */
export interface LevelOfAuthorityCatalogueResponse {
  businessTypes: LevelOfAuthorityOptionResponse[];
  claimNatures: LevelOfAuthorityOptionResponse[];
  roles: LevelOfAuthorityOptionResponse[];
}

/**
 * Body of both `POST` and `PUT`; every member required on both. Update replaces the three
 * ids as well as the amounts. The (business type, claim nature, role) triple is unique.
 */
export interface LevelOfAuthorityWriteRequest {
  businessTypeId: number;
  claimNatureId: number;
  roleId: number;
  fromAmount: number;
  toAmount: number;
}

/** `changedFields` empty: the server wrote and logged nothing. */
export interface LevelOfAuthorityWriteResponse {
  levelOfAuthority: LevelOfAuthorityResponse;
  changedFields: string[];
}

// ─── User Mapping (MenuID 91, CPS_User_Mapping.aspx) ────────────────────────

/** Which accounts the user picker and the roles-by-region views count. */
export type UserMappingUserStatus = 'All' | 'Active' | 'Inactive';

export interface UserMappingRoleResponse {
  roleId: ApiInt;
  roleName: string;
  roleDescription: string;
  /** Deactivated roles are listed so a held one can be shown; moving a user onto one is refused. */
  isActive: boolean;
}

export interface UserMappingBusinessTypeResponse {
  businessTypeId: ApiInt;
  name: string;
}

export interface UserMappingAreaResponse {
  /** A tilde-joined geography path. Opaque — send it back exactly as received. */
  code: string;
  shortName: string;
  name: string;
  regionCode: string;
  isActive: boolean;
}

export interface UserMappingRegionResponse {
  code: string;
  shortName: string;
  name: string;
  isActive: boolean;
  areas: UserMappingAreaResponse[];
}

/** Everything the mapping form offers. Retired regions and areas are omitted by default. */
export interface UserMappingCatalogueResponse {
  roles: UserMappingRoleResponse[];
  businessTypes: UserMappingBusinessTypeResponse[];
  regions: UserMappingRegionResponse[];
}

/** One Promo_Management_2 account, with a summary of what it holds. */
export interface UserMappingUserResponse {
  userId: string;
  fullName: string;
  email: string;
  isActive: boolean | null;
  roleId: ApiInt | null;
  /** Null when the account holds no role. */
  roleName: string | null;
  businessTypeCount: ApiInt;
  regionCount: ApiInt;
  areaCount: ApiInt;
}

export interface UserMappingRoleAssignment {
  roleId: ApiInt;
  roleName: string;
  /** False when the stored id names no role. */
  exists: boolean;
}

export interface UserMappingBusinessTypeAssignment {
  businessTypeId: ApiInt;
  name: string;
  exists: boolean;
}

export interface UserMappingRegionAssignment {
  code: string;
  shortName: string;
  name: string;
  exists: boolean;
  isActive: boolean;
}

export interface UserMappingAreaAssignment {
  code: string;
  shortName: string;
  name: string;
  regionCode: string;
  exists: boolean;
  isActive: boolean;
  /** An area without its region grants nothing — the claim procedures join the two. */
  regionHeld: boolean;
}

/** Everything one user holds. Held rows report whether they still exist and are active. */
export interface UserMappingResponse {
  userId: string;
  fullName: string;
  email: string;
  userIsActive: boolean | null;
  role: UserMappingRoleAssignment | null;
  businessTypes: UserMappingBusinessTypeAssignment[];
  regions: UserMappingRegionAssignment[];
  areas: UserMappingAreaAssignment[];
}

/**
 * `PUT /admin2/user-mapping/users/{userId}` — the complete intended mapping. Every member is
 * required and non-empty; every area must sit under one of the regions.
 */
export interface UserMappingWriteRequest {
  roleId: number;
  businessTypeIds: number[];
  regionCodes: string[];
  areaCodes: string[];
}

/** The true diff, computed inside the write transaction. */
export interface UserMappingChangesResponse {
  roleAssigned: ApiInt | null;
  roleRemoved: ApiInt | null;
  businessTypesAdded: ApiInt[];
  businessTypesRemoved: ApiInt[];
  regionsAdded: string[];
  regionsRemoved: string[];
  /** Includes areas removed because their region was. */
  areasAdded: string[];
  areasRemoved: string[];
  hasChanges: boolean;
}

export interface UserMappingWriteResponse {
  userId: string;
  changes: UserMappingChangesResponse;
  /** The post-state, so no follow-up read is needed. */
  mapping: UserMappingResponse;
}

// Roles by region.

export type UserMappingRegionRoleSort = 'Region' | 'Role' | 'User';

/** The filters both roles-by-region endpoints share, so a count and its account list agree. */
export interface UserMappingRegionRoleFilter {
  search?: string;
  roleId?: number;
  regionCode?: string;
  withoutRole?: boolean;
  withoutRegion?: boolean;
  status?: UserMappingUserStatus;
}

export interface UserMappingRoleCountResponse {
  /** Null for accounts with no role. */
  roleId: ApiInt | null;
  roleName: string | null;
  userCount: ApiInt;
  activeUserCount: ApiInt;
}

export interface UserMappingRegionRoleSummaryResponse {
  /** Null for the accounts mapped to no region — always the last group. */
  regionCode: string | null;
  regionShortName: string;
  regionName: string;
  regionExists: boolean;
  regionIsActive: boolean;
  userCount: ApiInt;
  activeUserCount: ApiInt;
  /** Most accounts first. */
  roles: UserMappingRoleCountResponse[];
}

export interface UserMappingRegionRolesResponse {
  /** Distinct accounts. One mapped to three regions counts once here, and once in each region. */
  totalUsers: ApiInt;
  totalRegionAssignments: ApiInt;
  roleTotals: UserMappingRoleCountResponse[];
  regions: UserMappingRegionRoleSummaryResponse[];
}

/** One account in one region, or with a null region when it holds none. */
export interface UserMappingRegionRoleRowResponse {
  userId: string;
  fullName: string;
  email: string;
  userIsActive: boolean | null;
  roleId: ApiInt | null;
  roleName: string | null;
  regionCode: string | null;
  regionShortName: string;
  regionName: string;
  regionExists: boolean;
  regionIsActive: boolean;
}

export interface UserMappingRegionRolePageResponse {
  items: UserMappingRegionRoleRowResponse[];
  totalCount: ApiInt;
  page: ApiInt;
  pageSize: ApiInt;
  /** Null on the last page. */
  nextPage: ApiInt | null;
}

// ─── Claim Hierarchy (MenuID 90, CPS_Claim_Hierarchy.aspx) ──────────────────

export interface ClaimHierarchyBusinessTypeResponse {
  businessTypeId: ApiInt;
  name: string;
}

/** Every Administration 2.0 role — inactive ones included; the catalogue does not say which. */
export interface ClaimHierarchyRoleResponse {
  roleId: ApiInt;
  name: string;
  description: string;
}

export interface ClaimHierarchyCatalogueResponse {
  businessTypes: ClaimHierarchyBusinessTypeResponse[];
  roles: ClaimHierarchyRoleResponse[];
}

export interface ClaimHierarchyLevelResponse {
  /** The stored step. Legacy saves left gaps and ties; only the order matters, and every write renumbers from 1. */
  sequence: ApiInt;
  roleId: ApiInt;
  roleName: string;
  roleDescription: string;
}

/** One business type's approval order, first approver first. */
export interface ClaimHierarchyResponse {
  businessTypeId: ApiInt;
  businessType: string;
  levels: ClaimHierarchyLevelResponse[];
}

/** `PUT /admin2/claim-hierarchies/{businessTypeId}` — exactly these roles, in this order. Empty clears it. */
export interface ReplaceClaimHierarchyRequest {
  roleIds: number[];
}

export interface ClaimHierarchyWriteResponse {
  hierarchy: ClaimHierarchyResponse;
  previousRoleIds: ApiInt[];
  /** False when the stored rows already matched: nothing was written or logged. */
  changed: boolean;
}

// ─── Distributor Access (MenuID 93, CPS_Access_Control.aspx) ────────────────
//
// `Promo_Management_2.dbo.MenuItems_Mapping_Distributor` — the distributor portal's own
// menu grants, keyed by `Distributor.user_id`. A different table from both the per-user
// (97) and role-wise (154) access screens, over a different menu catalogue
// (`MenuItems_Distributor`, 23 items), so none of those types apply here.

/** One distributor on the picker, with how many menu items it holds now. */
export interface DistributorAccessDistributorResponse {
  /** `Distributor.user_id` — the login, and the key the grants are stored under. */
  distributorId: string;
  /** Trimmed by the server: many stored names begin with a space. */
  name: string;
  isActive: boolean;
  /** Reported as stored. Four distributors are both active and deleted. */
  isDeleted: boolean;
  /**
   * Stored grants, orphaned ones included — so it can exceed what the sidebar shows, and
   * can count menu ids the catalogue no longer holds.
   */
  grantedMenuCount: ApiInt;
}

/** One item of the distributor portal's menu. Two levels in practice. */
export interface DistributorMenuResponse {
  menuId: ApiInt;
  menuName: string;
  /** The legacy `.aspx`. The only thing telling two same-named rows apart. */
  menuPage: string;
  orderId: ApiInt;
  children: DistributorMenuResponse[];
}

export interface DistributorAccessCatalogueResponse {
  distributors: DistributorAccessDistributorResponse[];
  menus: DistributorMenuResponse[];
}

/** One menu item in a distributor's access tree. */
export interface DistributorAccessNodeResponse {
  menuId: ApiInt;
  menuName: string;
  menuPage: string;
  orderId: ApiInt;
  isGranted: boolean;
  /**
   * Granted while its parent is not. Stored, but never shown: the distributor sidebar
   * lists only the children of a granted parent.
   */
  isOrphaned: boolean;
  children: DistributorAccessNodeResponse[];
}

/** One distributor's menu access — what the legacy tree should have shown and never did. */
export interface DistributorAccessResponse {
  distributorId: string;
  name: string;
  isActive: boolean;
  isDeleted: boolean;
  tree: DistributorAccessNodeResponse[];
  /** Exactly what is stored. Send it back for a no-op write. */
  menuIds: ApiInt[];
  orphanedMenuIds: ApiInt[];
}

/**
 * `PUT /admin2/distributor-access/menus` — give every named distributor exactly these
 * menu items, replacing what each holds now.
 *
 * `menuIds` is required: an empty array revokes everything, an absent one is refused, so
 * a mistyped property cannot become a silent revoke-all.
 */
export interface ReplaceDistributorAccessRequest {
  distributorIds: string[];
  menuIds: number[];
}

/** What a write changed for one distributor. */
export interface DistributorAccessChangeResponse {
  distributorId: string;
  name: string;
  isActive: boolean;
  added: ApiInt[];
  removed: ApiInt[];
}

export interface DistributorAccessWriteResponse {
  /** The menu set every named distributor now holds. */
  menuIds: ApiInt[];
  /** Grants inserted across all of them — and audit rows written for them. */
  addedCount: ApiInt;
  removedCount: ApiInt;
  /** One entry per distributor, in the order they were named. */
  distributors: DistributorAccessChangeResponse[];
}
