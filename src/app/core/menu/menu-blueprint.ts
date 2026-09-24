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
   * Query string the row's sidebar sub-menu opens `route` with, when the screen selects the
   * facet from the URL (`/admin/ownership?tab=activity`). Rows without it open the screen
   * as it lands.
   */
  queryParams?: Readonly<Record<string, string>>;
  /**
   * The row whose screen this row is a tab of. The sidebar lists this row only when that row
   * is not granted: otherwise the tab is reached through it ("Assign Role to User" is a tab
   * of the screen "Create User" opens). Unlike `hidden`, this never costs anyone their way in
   * — whoever holds the tab but not the screen's own row still gets an entry.
   */
  foldsInto?: number;
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

export const NAV_GROUP_ADMIN = 'Administration 1.0';
export const NAV_GROUP_ADMIN_2 = 'Administration 2.0';
export const NAV_GROUP_TRADE = 'Trade Marketing';
export const NAV_GROUP_INSIGHTS = 'Insights';
export const NAV_GROUP_OPERATIONS = 'Operations';
export const NAV_GROUP_MORE = '';

// ─── Administration 1.0 ───────────────────────────────────────────────────────
//
// Fifteen legacy rows collapse to six destinations. The Users screen absorbs seven of
// them as tabs, which is the whole argument for doing this: those seven rows are seven
// sub-resources of `/admin/users/{userId}` in the contract, and the legacy menu was the
// only thing still treating them as seven separate errands.
//
// Note two Administration capabilities, "Add Menu" (235) and "Freq Config" (236), have grid
// rows that are Unset (Active NULL / ''), so `/identity/menu` never returns them. They are
// mapped below for the day they are marked Visible, and until then reach administrators
// through ADMIN_ONLY_ROUTES.
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
  // The query string is the tab: the list carries it to the user it opens (UserListComponent.tab).
  // Roles, regions, brands and access are tabs of the screen "Create User" opens, so the
  // sidebar lists them only for someone without "Create User" (a client decision, 2026-09-18).
  {
    menuId: 20,
    legacyName: 'Change User Details',
    route: '/admin/users',
    tab: 'profile',
    queryParams: { tab: 'profile' },
    ported: true,
  },
  {
    menuId: 136,
    legacyName: 'Assign Role to User',
    route: '/admin/users',
    tab: 'roles',
    queryParams: { tab: 'roles' },
    foldsInto: 17,
    ported: true,
  },
  {
    menuId: 42,
    legacyName: 'User Region Mapping',
    route: '/admin/users',
    tab: 'regions',
    queryParams: { tab: 'regions' },
    foldsInto: 17,
    ported: true,
  },
  {
    menuId: 41,
    legacyName: 'User Brand Mapping',
    route: '/admin/users',
    tab: 'brands',
    queryParams: { tab: 'brands' },
    foldsInto: 17,
    ported: true,
  },
  {
    menuId: 19,
    legacyName: 'Access Control',
    route: '/admin/users',
    tab: 'access',
    queryParams: { tab: 'access' },
    foldsInto: 17,
    ported: true,
  },
  // Not shown in the sidebar — a client decision (2026-09-18). It is reached as a tab of
  // the user, which is where the date belongs: legacy made you find the person twice, once
  // in a dropdown and once in a grid underneath it.
  {
    menuId: 133,
    legacyName: 'Employee Resignation',
    route: '/admin/users',
    tab: 'resignation',
    ported: true,
    hidden: true,
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

  // → Re-Route Scheme moves pending approvals from one approver to another — above all off
  //   people who cannot act on them. "Hierarchy" (Hierarchy.aspx) designs the chains
  //   themselves — its own screen, Approval Hierarchy, built like Administration 2.0's Claim
  //   Hierarchy. The route was `/admin/approval-routing` while the two shared a destination;
  //   that path now redirects here.
  {
    menuId: 22,
    legacyName: 'Re-Route Scheme',
    route: '/admin/re-route',
    navLabel: 'Re-Route Scheme',
    icon: 'route',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },
  {
    menuId: 135,
    legacyName: 'Hierarchy',
    route: '/admin/approval-hierarchy',
    navLabel: 'Approval Hierarchy',
    icon: 'hierarchy-2',
    group: NAV_GROUP_ADMIN,
    // Hidden from the sidebar on 2026-09-18, shown again on 2026-09-21 now that it is its own
    // screen: a user granted menu 135 in Access Control sees it under Administration 1.0.
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
    queryParams: { tab: 'budget' },
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
    queryParams: { tab: 'activity' },
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

  // → The two screens ADMIN_ONLY_ROUTES also reaches. Their grid rows are Unset (Active
  //   NULL / ''), so the menu never returns them today; these entries take over the moment
  //   an administrator marks them Visible in the Menus grid.
  {
    menuId: 235,
    legacyName: 'Add Menu',
    route: '/admin/menus',
    navLabel: 'Menus',
    icon: 'menu-2',
    group: NAV_GROUP_ADMIN,
    ported: true,
  },
  {
    menuId: 236,
    legacyName: 'Freq Config',
    route: '/admin/frequency',
    navLabel: 'Scheme Frequency',
    icon: 'calendar-repeat',
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

// ─── Administration 2.0 ───────────────────────────────────────────────────────
//
// The CPS_* screens under menuId 92 (catalog "2"). They edit Promo_Management_2 — a
// different user population from 1.0's — so they get their own nav group rather than
// folding into Administration, and they are served from `/api/v1/admin2/...`.
//
// Every row has an entry, ported or not, for two reasons:
//
//   1. Without one, an unported row does not stay under its parent. Once a sibling is
//      mapped, "Administration 2.0" (92) counts as a grouping header, and each unmapped
//      sibling would surface as its own item under More.
//   2. Three share a name with a 1.0 row ("Access Control", "Access Control | By Role",
//      "Activity Logs"). For someone without the 1.0 row, the name fallback would fold the
//      2.0 row into the 1.0 screen — a Promo_2 grant opening a Promo screen.
//
// The unported rows fold into one "Legacy screens" destination, which lists them on the
// placeholder and keeps every legacy name findable in ⌘K. As a screen is built, give its
// row its own route, label and icon, as Create Distributor has.
//
// Not part of ADMINISTRATION_MENU_IDS: holding a 2.0 row does not make someone a 1.0
// administrator.
// const ADMIN_2_LEGACY_ROUTE = '/legacy/92';

// function legacyAdmin2(menuId: number, legacyName: string): MenuBlueprintEntry {
//   return {
//     menuId,
//     legacyName,
//     route: ADMIN_2_LEGACY_ROUTE,
//     // On every row, so the destination is named whichever of them this user holds.
//     navLabel: '',
//     icon: 'external-link',
//     group: NAV_GROUP_ADMIN_2,
//     ported: false,
//   };
// }

const ADMINISTRATION_2: MenuBlueprintEntry[] = [
  {
    menuId: 87,
    legacyName: 'Create Distributor',
    route: '/admin2/distributors',
    navLabel: 'Distributors',
    icon: 'truck-delivery',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    menuId: 88,
    legacyName: 'Create Role',
    route: '/admin2/roles',
    tab: 'details',
    navLabel: 'Roles',
    icon: 'shield-lock',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    menuId: 89,
    legacyName: 'Level Of Authorities',
    route: '/admin2/level-of-authorities',
    navLabel: 'Levels of Authority',
    icon: 'cash',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    menuId: 90,
    legacyName: 'Approval Hierarchy',
    route: '/admin2/claim-hierarchy',
    navLabel: 'Claim Hierarchy',
    icon: 'route',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    menuId: 91,
    legacyName: 'User Mapping',
    route: '/admin2/user-mapping',
    tab: 'mapping',
    navLabel: 'User Mapping',
    icon: 'users-group',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    menuId: 93,
    legacyName: 'Distributor Access',
    route: '/admin2/distributor-access',
    navLabel: 'Distributor Access',
    icon: 'key',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    // One account's Octane 2 menu access: the Menu access view of User Mapping. Named like
    // User Mapping, so the destination is labelled whichever of the two this user holds.
    menuId: 97,
    legacyName: 'Access Control',
    route: '/admin2/user-mapping',
    tab: 'access',
    queryParams: { view: 'access' },
    navLabel: 'User Mapping',
    icon: 'users-group',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  {
    // Each role's menu access, at /admin2/roles/:roleId/access. Named like Create Role, so the
    // Roles destination is labelled whichever of the two this user holds.
    menuId: 154,
    legacyName: 'Access Control | By Role',
    route: '/admin2/roles',
    tab: 'access',
    queryParams: { view: 'access' },
    navLabel: 'Roles',
    icon: 'shield-lock',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
  // legacyAdmin2(100, 'Claim KPI'),
  // "User Roles" and "User Regions" are not shown in the sidebar — a client decision
  // (2026-09-18). Entries rather than nothing, because an unmapped row would still render
  // under its module; `hidden` is what keeps a granted row out of the sidebar.
  {
    menuId: 232,
    legacyName: 'User Roles',
    route: '/legacy/232',
    group: NAV_GROUP_ADMIN_2,
    ported: false,
    hidden: true,
  },
  {
    menuId: 233,
    legacyName: 'User Regions',
    route: '/legacy/233',
    group: NAV_GROUP_ADMIN_2,
    ported: false,
    hidden: true,
  },
  {
    menuId: 230,
    legacyName: 'Activity Logs',
    route: '/admin2/activity-logs',
    navLabel: 'Activity Logs',
    icon: 'history',
    group: NAV_GROUP_ADMIN_2,
    ported: true,
  },
];

// ─── Initiate ─────────────────────────────────────────────────────────────────
//
// The screens under Initiate (menuId 1, catalog "1"), where schemes are defined and sent for
// approval, served from `/api/v1/initiate/...` and authorised on each screen's own menu grant.
// The module row itself stays `pending` below: its unported screens (Scheme Expire, Scheme
// Copier, BRD Schemes, …) fold into it and open their own legacy placeholder.
const INITIATE: MenuBlueprintEntry[] = [
  {
    menuId: 38,
    legacyName: 'Trade Offer - in Litres',
    route: '/initiate/trade-offer',
    navLabel: 'Trade Offer - in Litres',
    icon: 'discount-2',
    group: NAV_GROUP_TRADE,
    ported: true,
  },
];

// ─── Master Data ──────────────────────────────────────────────────────────────
//
// The screens under Master Data (menuId 35, catalog "1"), served from
// `/api/v1/master-data/...` and authorised on each screen's own menu grant. They are business
// screens used by scheme initiators, not administration ones, so they sit under Trade
// Marketing with the module. The module row itself stays `pending` below: its unported
// screens (Edit Budget, Gross Profit, …) fold into it and open their own legacy placeholder.
const MASTER_DATA: MenuBlueprintEntry[] = [
  {
    menuId: 36,
    legacyName: 'Budget',
    route: '/master-data/create-budget',
    navLabel: 'Create Budget',
    icon: 'wallet',
    group: NAV_GROUP_TRADE,
    ported: true,
  },
];

// ─── Approve ──────────────────────────────────────────────────────────────────
//
// The screens under Approve (menuId 2, catalog "1"), where budgets and schemes climb their
// approval cycles, served from `/api/v1/approve/...` and authorised on each screen's own menu
// grant. The module row itself stays `pending` below: its unported screens (Trade Offers,
// Trade Spend, JBP, …) fold into it and open their own legacy placeholder.
const APPROVE: MenuBlueprintEntry[] = [
  {
    menuId: 5,
    legacyName: 'Trade Offers',
    route: '/approve/trade-offers',
    navLabel: 'Trade Offers',
    icon: 'discount-2',
    group: NAV_GROUP_TRADE,
    ported: true,
  },
  {
    menuId: 40,
    legacyName: 'Budgets',
    route: '/approve/budgets',
    navLabel: 'Budgets',
    icon: 'square-check',
    group: NAV_GROUP_TRADE,
    ported: true,
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

export const MENU_BLUEPRINT: readonly MenuBlueprintEntry[] = [
  ...ADMINISTRATION,
  ...ADMINISTRATION_2,
  ...INITIATE,
  ...MASTER_DATA,
  ...APPROVE,
  ...OTHER_MODULES,
];

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

/**
 * First entry wins. Administration 2.0 repeats several 1.0 names ("Access Control",
 * "Activity Logs"), and a plain `new Map(entries)` would let the later 2.0 entry take the
 * name — so a 1.0 row whose id had drifted would fold into a 2.0 placeholder.
 */
export const BLUEPRINT_BY_NAME: ReadonlyMap<string, MenuBlueprintEntry> = MENU_BLUEPRINT.reduce(
  (byName, entry) => {
    const key = normaliseMenuName(entry.legacyName);
    if (!byName.has(key)) {
      byName.set(key, entry);
    }
    return byName;
  },
  new Map<string, MenuBlueprintEntry>(),
);

/**
 * Routes whose legacy menu row the menu payload never carries.
 *
 * "Add Menu" (235) and "Freq Config" (236) have grid rows, but both are Unset, and the
 * ported menu shows Visible rows only — so no grant can put them in the payload. Gating
 * them on a menu grant would make them permanently unreachable; leaving them ungated would
 * make them reachable by everyone. They are therefore gated on `isAdmin` — see
 * ADMINISTRATION_MENU_IDS — and listed here so the choice is explicit and reviewable
 * rather than an omission. In the sidebar they sit under Administration 1.0 with their
 * grid names, where the grid places them.
 */
export const ADMIN_ONLY_ROUTES: readonly {
  menuId: number;
  legacyName: string;
  route: string;
  navLabel: string;
  icon: string;
  group: string;
}[] = [
  {
    menuId: 235,
    legacyName: 'Add Menu',
    route: '/admin/menus',
    navLabel: 'Menus',
    icon: 'menu-2',
    group: NAV_GROUP_ADMIN,
  },
  {
    menuId: 236,
    legacyName: 'Freq Config',
    route: '/admin/frequency',
    navLabel: 'Scheme Frequency',
    icon: 'calendar-repeat',
    group: NAV_GROUP_ADMIN,
  },
];

/** The grid's "Administration 1.0" root — where the sidebar lists ADMIN_ONLY_ROUTES. */
export const ADMINISTRATION_ROOT_MENU_ID = 4;

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
