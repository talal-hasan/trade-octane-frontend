// ─────────────────────────────────────────────────────────────────────────────
// The menu blueprint — how the legacy menu becomes this application's navigation.
//
// `GET /identity/menu` returns the legacy tree exactly as Administration 1.0 renders it:
// 95 nodes, 20 roots, two levels deep, one entry per *action*. Rendering it as-is would
// give us a sidebar with fifteen sibling items under Administration — "Create User",
// "Assign Role to User", "User Region Mapping", "User Brand Mapping", "Access Control",
// "Change User Details", "Employee Resignation" — every one of which is a facet of a
// single noun: a user.
//
// The API already knows this. It is shaped `/admin/users/{id}/roles`, `/regions`,
// `/brands`, `/access`, `/password` — one resource, sub-resources. The blueprint is what
// lets the navigation catch up with the contract: it folds N legacy menu rows onto one
// screen, optionally onto one tab of that screen.
//
// ─── What the join key is, and why ───────────────────────────────────────────
//
// `menuId`. Not the name, and not `catalog`.
//
//   catalog  is "1" | "2" — the Octane discriminator (Administration 1.0 vs 2.0) as a
//            string. It is NOT a page path. There is no page path in this payload.
//   name     is not unique: "Perfect Store" appears twice, as menuId 76 and menuId 85.
//
// So `menuId` is the only stable identity, and every entry below keys on it. `legacyName`
// is carried alongside for three jobs: verifying the mapping against a live payload,
// feeding the command palette aliases, and making this file readable.
//
// [QUESTION for Zeeshan] menuIds must be stable across dev/UAT/prod. They will be if the
// legacy database was cloned per environment; they will not be if menu rows were inserted
// independently. If they turn out to drift, `matchByName` below is already the fallback
// and becomes the primary path.
//
// ─── The rule that keeps this file safe ──────────────────────────────────────
//
// **An unmapped menu row is never dropped.** A frontend-maintained map that silently
// swallows a menu row the backend added is a support incident nobody can diagnose from
// the UI. Anything without an entry here renders under NAV_GROUP_MORE, pointing at the
// not-yet-ported placeholder, and is reported by MenuTransformService.unmapped() so it
// shows up in dev rather than in a bug report.
// ─────────────────────────────────────────────────────────────────────────────

/** A destination screen, and optionally which tab of it a legacy row corresponds to. */
export interface MenuBlueprintEntry {
  /** Legacy menu row this maps. The join key. */
  menuId: number;
  /** The legacy label, verbatim. Used for verification and command-palette aliases. */
  legacyName: string;
  /** Angular route this row resolves to. Rows sharing a route are folded into one nav item. */
  route: string;
  /** Tab within `route`, when the row is a facet of a larger screen rather than a screen. */
  tab?: string;
  /**
   * Label for the folded nav item. Only the row that *names* the destination needs it;
   * sibling rows folding into the same route omit it and inherit.
   */
  navLabel?: string;
  /** Tabler icon for the folded nav item. Same rule as navLabel. */
  icon?: string;
  /** Nav group this destination sits in. Same rule as navLabel. */
  group?: string;
  /** False while the screen is still legacy-only — nav shows it, routes to the placeholder. */
  ported?: boolean;
  /**
   * Deliberately absent from the sidebar — reached some other way (the avatar menu).
   *
   * This must be explicit rather than inferred from "has no group", because a destination
   * can end up group-less by accident: the row that *names* it may simply not be granted
   * to this user. Treating that case as hidden would make a screen they legitimately hold
   * disappear from the nav entirely.
   */
  hidden?: boolean;
}

export const NAV_GROUP_ADMIN = 'Administration';
export const NAV_GROUP_TRADE = 'Trade Marketing';
export const NAV_GROUP_INSIGHTS = 'Insights';
export const NAV_GROUP_OPERATIONS = 'Operations';
export const NAV_GROUP_MORE = 'More';

// ─── Administration 1.0 ───────────────────────────────────────────────────────
//
// Fifteen legacy rows collapse to six destinations. The Users screen absorbs seven of
// them as tabs, which is the whole argument for doing this: those seven rows are seven
// sub-resources of `/admin/users/{userId}` in the contract, and the legacy menu was the
// only thing still treating them as seven separate errands.
//
// Note two Administration capabilities exist in the OpenAPI document but have **no menu
// row**: "Add Menu" (8 endpoints, tag `Administration 1.0 / Add Menu`) and "Frequency
// Configuration" (8 endpoints). They are unreachable from the legacy menu for this user.
// They are given routes here so the screens can be built and reached directly, but they
// cannot be gated on a menu grant that does not exist — see UNGATED_ROUTES below.
const ADMINISTRATION: MenuBlueprintEntry[] = [
  // → Users. One screen, tabbed, replacing seven menu rows.
  {
    menuId: 17,
    legacyName: 'Create User',
    route: '/admin/users',
    navLabel: 'Users',
    icon: 'users-group',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },
  { menuId: 20, legacyName: 'Change User Details', route: '/admin/users', tab: 'profile', ported: true },
  { menuId: 136, legacyName: 'Assign Role to User', route: '/admin/users', tab: 'roles', ported: true },
  { menuId: 42, legacyName: 'User Region Mapping', route: '/admin/users', tab: 'regions', ported: true },
  { menuId: 41, legacyName: 'User Brand Mapping', route: '/admin/users', tab: 'brands', ported: true },
  { menuId: 19, legacyName: 'Access Control', route: '/admin/users', tab: 'access', ported: true },
  {
    menuId: 133,
    legacyName: 'Employee Resignation',
    route: '/admin/users',
    tab: 'resignation',
    ported: false,
  },

  // → Roles. The role catalogue and the role access tree.
  {
    menuId: 142,
    legacyName: 'Access Control | By Role',
    route: '/admin/roles',
    navLabel: 'Roles',
    icon: 'shield-lock',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },

  // → Approval routing. "Hierarchy" designs the chain; "Re-Route Scheme" repairs one that
  //   is stuck. Same subject — who approves what — so they are two tabs, not two screens.
  {
    menuId: 135,
    legacyName: 'Hierarchy',
    route: '/admin/approval-routing',
    tab: 'hierarchy',
    navLabel: 'Approval Routing',
    icon: 'route',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },
  {
    menuId: 22,
    legacyName: 'Re-Route Scheme',
    route: '/admin/approval-routing',
    tab: 're-route',
    ported: true,
  },

  // → Ownership transfers. Both are the identical shape — filter a period, pick the
  //   current owner, preview the rows, pick the new owner, transfer under an
  //   expectedCount guard. Two tabs of one screen.
  {
    menuId: 225,
    legacyName: 'Change Budget Ownership',
    route: '/admin/ownership',
    tab: 'budget',
    navLabel: 'Ownership Transfers',
    icon: 'transfer',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },
  {
    menuId: 226,
    legacyName: 'Change Activity Ownership',
    route: '/admin/ownership',
    tab: 'activity',
    ported: true,
  },

  {
    menuId: 229,
    legacyName: 'Activity Logs',
    route: '/admin/activity-logs',
    navLabel: 'Activity Logs',
    icon: 'history',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },
  {
    menuId: 204,
    legacyName: 'Integration',
    route: '/admin/integration',
    navLabel: 'Integration',
    icon: 'plug-connected',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },

  // → Own account. "Edit Password" (UpdatePassword.aspx) changes *your own* password,
  //   which is not an administration errand at all — it belongs in the avatar menu, and
  //   is deliberately given no nav group so it never renders in the sidebar.
  //
  //   [ASSUMPTION] Legacy has both UpdatePassword.aspx (own) and ChangeUserPassword.aspx
  //   (someone else's). Mapping "Edit Password" (18) to own and "Change User Details"
  //   (20) to the admin-side editor matches those two pages and the two API endpoints
  //   (`/admin/account/password` vs `/admin/users/{id}/password`). Confirm against the
  //   legacy screens.
  {
    menuId: 18,
    legacyName: 'Edit Password',
    route: '/account',
    navLabel: 'My Account',
    icon: 'user-circle',
    ported: true,
    hidden: true,
  },
];

// ─── Everything else ──────────────────────────────────────────────────────────
//
// The other 19 root modules are outside the Administration 1.0 scope being built now.
// They are mapped to nav groups so the sidebar renders the user's real menu rather than a
// truncated one, and marked `ported: false` so every one of them routes to the honest
// "still in the legacy portal" placeholder instead of a 404 or a blank screen.
//
// As each module is built, flip `ported` and point `route` at the real screen. Nothing
// else in the app needs to change.
function pending(
  menuId: number,
  legacyName: string,
  group: string,
  icon?: string,
): MenuBlueprintEntry {
  return {
    menuId,
    legacyName,
    route: `/legacy/${menuId}`,
    navLabel: legacyName,
    icon,
    group,
    ported: false,
  };
}

const OTHER_MODULES: MenuBlueprintEntry[] = [
  pending(1, 'Initiate', NAV_GROUP_TRADE, 'pencil'),
  pending(196, 'FSD Bulk Schemes', NAV_GROUP_TRADE, 'discount-2'),
  pending(51, 'Claims', NAV_GROUP_TRADE, 'file-invoice'),
  pending(94, 'Claim Module', NAV_GROUP_TRADE, 'mail'),
  pending(2, 'Approve', NAV_GROUP_TRADE, 'check'),
  pending(69, 'JBP', NAV_GROUP_TRADE, 'refresh'),
  pending(35, 'Master Data', NAV_GROUP_TRADE, 'database-cog'),

  pending(65, 'Dashboard', NAV_GROUP_INSIGHTS, 'layout-dashboard'),
  pending(31, 'Reports', NAV_GROUP_INSIGHTS, 'files'),
  pending(107, 'Claim Status Report', NAV_GROUP_INSIGHTS, 'flag'),
  pending(114, 'Claim Raise Report', NAV_GROUP_INSIGHTS, 'files'),
  pending(95, 'Distributor ROI', NAV_GROUP_INSIGHTS, 'device-desktop'),
  pending(231, 'FAQs', NAV_GROUP_INSIGHTS, 'help'),

  pending(155, 'Auto Replenishment', NAV_GROUP_OPERATIONS, 'bolt'),
  pending(76, 'Perfect Store', NAV_GROUP_OPERATIONS, 'shopping-cart'),
  pending(192, 'PS Portal', NAV_GROUP_OPERATIONS, 'device-desktop'),
  pending(227, 'Auto DA', NAV_GROUP_OPERATIONS, 'truck-delivery'),
  pending(210, 'Hub & Spoke', NAV_GROUP_OPERATIONS, 'building-warehouse'),
  pending(188, 'Advance SIDA', NAV_GROUP_OPERATIONS, 'cash'),
];

export const MENU_BLUEPRINT: readonly MenuBlueprintEntry[] = [...ADMINISTRATION, ...OTHER_MODULES];

/**
 * The Administration 1.0 menu rows.
 *
 * Holding any of them is what "is an administrator" means in this application. There is no
 * admin flag to read: `AccountResponse` does not carry one, and `UserResponse.isAdmin`
 * would cost a `GET /admin/users/{self}` call that a non-admin would be refused — so
 * asking whether someone can already reach an Administration screen is both cheaper and a
 * better answer than asking whether a column says they are special.
 *
 * "Edit Password" (18) is excluded: it is every user's own password screen, not an
 * administration grant, and including it would make the entire user base administrators.
 */
export const ADMINISTRATION_MENU_IDS: readonly number[] = ADMINISTRATION.filter(
  (entry) => entry.menuId !== 18,
).map((entry) => entry.menuId);

/** menuId → entry. Built once; the transform runs on every menu load. */
export const BLUEPRINT_BY_MENU_ID: ReadonlyMap<number, MenuBlueprintEntry> = new Map(
  MENU_BLUEPRINT.map((entry) => [entry.menuId, entry]),
);

/**
 * Fallback lookup for when a menuId does not match — which happens if menu rows were
 * inserted per-environment rather than cloned. Names are compared case-insensitively with
 * punctuation and whitespace collapsed, so "Access Control | By Role" still matches
 * "Access control - by role".
 *
 * This is a safety net, not the contract. A name match is logged as a near-miss by
 * MenuTransformService so the menuId can be corrected in this file.
 */
export function normaliseMenuName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const BLUEPRINT_BY_NAME: ReadonlyMap<string, MenuBlueprintEntry> = new Map(
  MENU_BLUEPRINT.map((entry) => [normaliseMenuName(entry.legacyName), entry]),
);

/**
 * Routes that exist in the application but have **no** legacy menu row to gate them.
 *
 * "Add Menu" and "Frequency Configuration" are fully specified in the OpenAPI document
 * (8 endpoints each) yet appear nowhere in the menu payload. Gating them on a menu grant
 * would make them permanently unreachable; leaving them ungated would make them reachable
 * by everyone. They are therefore gated on the one signal we do have — `UserResponse.isAdmin`
 * — and listed here so the choice is explicit and reviewable rather than an omission.
 *
 * [QUESTION for Zeeshan] Should these get menu rows? If they are meant to be admin-only
 * with no menu presence, this list is correct and should stay.
 */
export const ADMIN_ONLY_ROUTES: readonly { route: string; navLabel: string; icon: string; group: string }[] = [
  { route: '/admin/menus', navLabel: 'Menus', icon: 'menu-2', group: NAV_GROUP_ADMIN },
  {
    route: '/admin/frequency',
    navLabel: 'Scheme Frequency',
    icon: 'calendar-repeat',
    group: NAV_GROUP_ADMIN,
  },
];

/**
 * The Access Explorer has no legacy menu row either — it is the consolidation of five
 * cross-user mapping grids (`/admin/user-roles`, `/user-regions`, `/user-brands`,
 * `/user-menus`, `/role-menus`) that legacy never surfaced as screens at all; they were
 * only reachable as the grids inside the individual mapping pages.
 *
 * It is gated on holding any of the mapping menu rows, since it shows exactly the data
 * those rows govern.
 */
export const ACCESS_EXPLORER_ROUTE = '/admin/access-explorer';
export const ACCESS_EXPLORER_GATED_ON: readonly number[] = [136, 42, 41, 19, 142];
