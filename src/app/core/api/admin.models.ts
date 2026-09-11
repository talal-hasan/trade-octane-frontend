import { ApiInt, CursorPage } from './api.types';

// ─── Users (tag: Administration 1.0 / Create User) ────────────────────────────

export type UserStatusFilter = 'All' | 'Active' | 'Inactive' | 'Locked' | 'PendingFirstLogin';
export type UserSortField = 'UserId' | 'FullName' | 'Email' | 'Status';

/**
 * `userId` *is* the login name — every `/admin/users/{userId}` path segment takes it.
 * There is no surrogate key, so a user cannot be renamed without breaking their history;
 * `SetUserPasswordRequest.loginName` is the one endpoint that can change it.
 *
 * `passwordCipher` is returned by the contract. We never read it, never store it, and
 * never render it. It is typed here so nobody "discovers" it later and assumes it is
 * meant to be used.
 */
export interface UserResponse {
  userId: string;
  fullName: string;
  email: string;
  domainId: string | null;
  isActive: boolean;
  isAdmin: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  passwordSetAtUtc: string | null;
  resignationDate: string | null;
  /** Never render. Never log. See note above. */
  passwordCipher?: string | null;
}

export interface UserWrapperResponse {
  data: UserResponse;
}

export type UserPageResponse = CursorPage<UserResponse>;

export interface CreateUserRequest {
  loginName: string;
  fullName: string;
  email: string;
  password: string;
  domainId: string | null;
}

/** What `GET /admin/users/lookup?email=` proposes to pre-fill the create form with. */
export interface UserCreationSuggestion {
  source: string;
  loginName: string;
  fullName: string;
  email: string;
  domainId: string | null;
  requiresPassword: boolean;
}

/** The "Check" button: is this address taken, and what should the form be pre-filled with? */
export interface UserLookupResponse {
  exists: boolean;
  user: UserResponse | null;
  suggestion: UserCreationSuggestion | null;
}

export interface UserLookupWrapperResponse {
  data: UserLookupResponse;
}

// ─── Account & passwords (tag: Administration 1.0 / Update Password) ───────────

export interface AccountResponse {
  userId: string;
  loginName: string;
  fullName: string;
  email: string;
  domainId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  isLocked: boolean;
  passwordSetAtUtc: string | null;
  passwordAgeDays: ApiInt | null;
  passwordHistoryMissing: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  fullName?: string | null;
  email?: string | null;
}

/**
 * `newPassword` is nullable, and the response reports `profileUpdated` separately from
 * the password change — so this endpoint doubles as **the only way to edit a user's
 * profile**. Sending `{ fullName, email, newPassword: null }` renames a user without
 * touching their credentials. There is no `PUT /admin/users/{userId}`; this is it.
 */
export interface SetUserPasswordRequest {
  newPassword: string | null;
  fullName: string | null;
  email: string | null;
  forceChangeAtNextSignIn: boolean | null;
  loginName: string | null;
}

export interface ResetPasswordRequest {
  newPassword: string | null;
}

export interface PasswordChangeResponse {
  userId: string;
  mustChangePassword: boolean;
  profileUpdated: boolean;
  account: AccountResponse;
}

// ─── Roles (tag: Administration 1.0 / Assign Role To User) ────────────────────

export type RoleStatusFilter = 'All' | 'Active' | 'Inactive';
export type UserRoleSortField = 'UserId' | 'FullName' | 'RoleName' | 'RoleId';

export interface RoleResponse {
  roleId: ApiInt;
  roleName: string;
  roleDescription: string | null;
  isActive: boolean;
  assignedUserCount: ApiInt;
}

/**
 * `POST /admin/roles`. Has no legacy counterpart — nothing in the Web Forms application
 * could create a role, so the 43 existing rows were inserted by hand.
 *
 * `roleName` is required and must be unique, case-insensitively. `roleDesc` is optional.
 * `status` is optional and defaults to `true` server-side: send `false` to create a
 * retired role deliberately.
 */
export interface CreateRoleRequest {
  roleName: string;
  roleDesc: string | null;
  status: boolean | null;
}

/**
 * One baseline grant the new role was seeded with — the parent menu and the child beneath
 * it (`Administration 1.0` / `Edit Password` by default), so the role can at least reach
 * the change-password screen. A `null` `menuId` means the menu was not found by name and
 * the grant was skipped; the role itself is still created either way.
 */
export interface BaselineMenuGrantResponse {
  menuName: string;
  menuId: ApiInt | null;
}

export interface CreateRoleResponse {
  role: RoleResponse;
  baselineGrants: BaselineMenuGrantResponse[];
}

/**
 * A user's roles, split into what they hold and what they could hold.
 *
 * This is the **normalised** shape. `AdminRolesApi` guarantees both lists are real arrays;
 * see `UserRoleAssignmentWire` for what the server actually sends.
 */
export interface UserRoleAssignmentResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean;
  assigned: RoleResponse[];
  available: RoleResponse[];
}

/**
 * [CONTRACT BUG — raised with Zeeshan] The same payload as it comes off the wire.
 *
 * `assigned` is declared as an array but is returned as a **bare object** when the user
 * holds exactly one role:
 *
 *     "assigned": { "roleId": 2, "roleName": "RSM", ... }
 *
 * `available` is typed permissively for the same reason, on the assumption that whatever
 * serialises one of them this way can do it to the other. Normalise with `asList` at the
 * API boundary and nothing downstream has to know.
 */
export interface UserRoleAssignmentWire {
  userId: string;
  fullName: string;
  userIsActive: boolean;
  assigned: RoleResponse[] | RoleResponse | null;
  available: RoleResponse[] | RoleResponse | null;
}

export interface UserRoleResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean | null;
  roleId: ApiInt;
  roleName: string;
  roleDescription: string | null;
  roleIsActive: boolean;
  /** False when the row exists but cannot authorise anything — a dead mapping. */
  grantsAccess: boolean;
}

export type UserRolePageResponse = CursorPage<UserRoleResponse>;

/**
 * [CONTRACT BUG — raised with Zeeshan] This carries a **single scalar** `roleId`, yet it is
 * the body for `PUT …/roles` ("Set a user's roles to exactly this set") whose response
 * reports `added[]` / `removed[]` / `unchanged[]`. A scalar cannot express a set, and every
 * sibling write request (`regionCodes`, `brandCodes`, `menuIds`) is an array.
 *
 * Until it is fixed, AdminRolesApi.replaceUserRoles composes a correct set-write out of the
 * scalar primitives (DELETE the surplus, POST the additions). Swap it for one PUT when the
 * contract grows `roleIds`.
 */
export interface UserRoleWriteRequest {
  roleId: ApiInt;
}

export interface UserRoleWriteResponse {
  userId: string;
  added: ApiInt[];
  removed: ApiInt[];
  unchanged: ApiInt[];
  assignment: UserRoleAssignmentResponse;
}

/** `UserRoleWriteResponse` as it comes off the wire — see `UserRoleAssignmentWire`. */
export interface UserRoleWriteWire {
  userId: string;
  added: ApiInt[];
  removed: ApiInt[];
  unchanged: ApiInt[];
  assignment: UserRoleAssignmentWire;
}

// ─── Regions & brands (tags: User Region / User Brand Mapping) ────────────────

export type RegionStatusFilter = 'All' | 'Active' | 'Retired';
export type BrandStatusFilter = 'All' | 'Active' | 'Retired';
export type UserRegionSortField = 'UserId' | 'FullName' | 'RegionName' | 'RegionCode';
export type UserBrandSortField = 'UserId' | 'FullName' | 'BrandName' | 'BrandCode';

/**
 * Regions live in `Centegy_SnDPro_DR.dbo.GEO_LEVEL6` — a different database, so no foreign
 * key protects the mapping table and **codes must be sent back exactly as reported here**.
 * Do not trim, upper-case, or otherwise normalise `code` anywhere in the UI.
 */
export interface RegionResponse {
  code: string;
  shortName: string;
  name: string;
  isActive: boolean;
  assignedUserCount: ApiInt;
}

/** Same cross-database caveat as RegionResponse — send `code` back verbatim. */
export interface BrandResponse {
  code: string;
  shortName: string;
  name: string;
  isActive: boolean;
  hasMasterSku: boolean;
  assignedUserCount: ApiInt;
}

export interface UserRegionAssignmentResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean;
  assigned: RegionResponse[];
  available: RegionResponse[];
}

export interface UserBrandAssignmentResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean;
  assigned: BrandResponse[];
  available: BrandResponse[];
}

export interface UserRegionResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean | null;
  regionCode: string;
  regionShortName: string;
  regionName: string;
  regionExists: boolean;
  regionIsActive: boolean;
  grantsAccess: boolean;
}

export interface UserBrandResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean | null;
  brandCode: string;
  brandShortName: string;
  brandName: string;
  brandExists: boolean;
  brandIsActive: boolean;
  grantsAccess: boolean;
}

export type UserRegionPageResponse = CursorPage<UserRegionResponse>;
export type UserBrandPageResponse = CursorPage<UserBrandResponse>;

export interface UserRegionWriteRequest {
  regionCodes: string[];
}
export interface UserBrandWriteRequest {
  brandCodes: string[];
}

export interface UserRegionWriteResponse {
  userId: string;
  added: string[];
  removed: string[];
  unchanged: string[];
  assignment: UserRegionAssignmentResponse;
}

export interface UserBrandWriteResponse {
  userId: string;
  added: string[];
  removed: string[];
  unchanged: string[];
  assignment: UserBrandAssignmentResponse;
}

// ─── Access control (tags: Access Control / Access Control By Role) ───────────

export type AccessTreeScope = 'All' | 'Granted' | 'Available';
export type AccessStatusFilter = 'All' | 'Active' | 'Inactive';
export type AccessSortField = 'Owner' | 'OwnerName' | 'MenuName' | 'MenuId';

/** Where a node's grant comes from. `Both` means direct *and* via a role. */
export type AccessGrantSource = 'None' | 'Direct' | 'Role' | 'Both';

/**
 * One node of the access tree. This is the replacement for legacy's `trv_Menu`, which
 * could not distinguish a direct grant from a role-derived one — hence `grantSource` and
 * `grantingRoles`, which are what make the checkbox explicable rather than merely ticked.
 *
 * `isOrphaned` = the grant points at a menu row that no longer exists.
 */
export interface AccessNodeResponse {
  menuId: ApiInt;
  menuName: string;
  menuPage: string;
  parentId: ApiInt;
  isActive: boolean;
  isGranted: boolean;
  grantSource: AccessGrantSource;
  isOrphaned: boolean;
  matchesFilter: boolean;
  grantingRoles: string[];
  children: AccessNodeResponse[];
}

export interface UserAccessRoleResponse {
  roleId: ApiInt;
  roleName: string;
  isActive: boolean;
  grantedMenuCount: ApiInt;
}

/**
 * The three id sets are **not** interchangeable, and confusing them is the single easiest
 * way to build a broken access screen:
 *
 *   directMenuIds    what PUT/POST/DELETE on this endpoint control. Editable.
 *   roleMenuIds      supplied by the user's live roles. PUT here **cannot** remove these.
 *   effectiveMenuIds (direct union role) filtered to active items — what actually
 *                    authorises requests server-side. This is the set the UI gates on.
 *
 * A checkbox bound to `effectiveMenuIds` that writes to `directMenuIds` will appear to
 * "not save" whenever a role already grants the row. Bind the control to direct, show the
 * effective state, and label role-derived rows as inherited.
 */
export interface UserAccessResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean;
  tree: AccessNodeResponse[];
  directMenuIds: ApiInt[];
  effectiveMenuIds: ApiInt[];
  roleMenuIds: ApiInt[];
  roles: UserAccessRoleResponse[];
  orphanedMenuIds: ApiInt[];
}

export interface UserAccessWriteRequest {
  menuIds: ApiInt[];
}

export interface UserAccessWriteResponse {
  userId: string;
  added: ApiInt[];
  removed: ApiInt[];
  unchanged: ApiInt[];
  /** Removed from direct grants but still reachable via a role — so nothing changed. */
  noLongerEffective: ApiInt[];
  access: UserAccessResponse;
}

export interface RoleAccessResponse {
  roleId: ApiInt;
  roleName: string;
  isActive: boolean;
  userCount: ApiInt;
  activeUserCount: ApiInt;
  tree: AccessNodeResponse[];
  menuIds: ApiInt[];
  orphanedMenuIds: ApiInt[];
}

export interface RoleAccessWriteRequest {
  menuIds: ApiInt[];
}

export interface RoleAccessWriteResponse {
  roleId: ApiInt;
  added: ApiInt[];
  removed: ApiInt[];
  unchanged: ApiInt[];
  /** Blast radius. Editing a role's access changes access for this many people. */
  affectedUserCount: ApiInt;
  affectedUserIds: string[];
  access: RoleAccessResponse;
}

export interface UserMenuGrantResponse {
  userId: string;
  fullName: string;
  userIsActive: boolean | null;
  menuId: ApiInt;
  menuName: string;
  menuPage: string;
  parentId: ApiInt;
  parentName: string | null;
  menuExists: boolean;
  menuIsActive: boolean;
  isOrphaned: boolean;
  alsoGrantedByRole: boolean;
  grantsAccess: boolean;
}

export interface RoleMenuGrantResponse {
  roleId: ApiInt;
  roleName: string;
  roleIsActive: boolean;
  roleExists: boolean;
  userCount: ApiInt;
  activeUserCount: ApiInt;
  menuId: ApiInt;
  menuName: string;
  menuPage: string;
  parentId: ApiInt;
  parentName: string | null;
  menuExists: boolean;
  menuIsActive: boolean;
  isOrphaned: boolean;
  grantsAccess: boolean;
}

export type UserMenuGrantPageResponse = CursorPage<UserMenuGrantResponse>;
export type RoleMenuGrantPageResponse = CursorPage<RoleMenuGrantResponse>;

// ─── Menus (tag: Administration 1.0 / Add Menu) ───────────────────────────────

/** Octane1 is the Administration 1.0 tree; Octane2 is Administration 2.0. */
export type MenuOctane = 'Octane1' | 'Octane2';
export type MenuActivation = 'Active' | 'Hidden' | 'Unset';
export type MenuStatusFilter = 'All' | 'Active' | 'Hidden' | 'Unset';
export type MenuSortField = 'TreeOrder' | 'MenuName' | 'MenuPage' | 'MenuId';

/**
 * `rendersInLegacyMenu` and `rendersInPortedMenu` can disagree — the same row may be live
 * in one application and hidden in the other, which is what `activationMismatchCount`
 * counts. The menu grid surfaces the mismatch rather than picking one to believe.
 */
export interface MenuResponse {
  menuId: ApiInt;
  menuName: string;
  menuPage: string;
  parentId: ApiInt;
  parentName: string | null;
  orderId: ApiInt;
  icons: string | null;
  octane: MenuOctane;
  activation: MenuActivation;
  childCount: ApiInt;
  roleGrants: ApiInt;
  userGrants: ApiInt;
  /** False = nothing links here. A menu row nobody can ever reach. */
  isReachable: boolean;
  rendersInLegacyMenu: boolean;
  rendersInPortedMenu: boolean;
}

export interface MenuPageResponse {
  items: MenuResponse[];
  nextCursor: string | null;
  totalCount: ApiInt;
  pageSize: ApiInt;
  snapshotVersion: ApiInt;
  activationMismatchCount: ApiInt;
}

export interface MenuTreeNode {
  menu: MenuResponse;
  children: MenuResponse[];
}

export interface MenuTreeResponse {
  octane: MenuOctane;
  roots: MenuTreeNode[];
}

export interface MenuWriteRequest {
  menuName: string;
  menuPage: string;
  parentId: ApiInt | null;
  orderId: ApiInt | null;
  icons: string | null;
  octane: MenuOctane;
  activation: MenuActivation;
}

export interface MenuActivationRequest {
  activation: MenuActivation;
}

export interface MenuWriteResponse {
  menu: MenuResponse;
  /** True when the new row is invisible to everyone until someone grants it. */
  requiresAccessGrant: boolean;
}
