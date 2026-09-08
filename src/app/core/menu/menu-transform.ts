import { MenuItemResponse } from '../api/identity.models';
import { int } from '../api/api.types';
import {
  ACCESS_EXPLORER_GATED_ON,
  ACCESS_EXPLORER_ROUTE,
  ADMIN_ONLY_ROUTES,
  BLUEPRINT_BY_MENU_ID,
  BLUEPRINT_BY_NAME,
  MenuBlueprintEntry,
  NAV_GROUP_ADMIN,
  NAV_GROUP_INSIGHTS,
  NAV_GROUP_MORE,
  NAV_GROUP_OPERATIONS,
  NAV_GROUP_TRADE,
  normaliseMenuName,
} from './menu-blueprint';

// ─────────────────────────────────────────────────────────────────────────────
// Pure transform: the granted legacy menu tree in, this application's navigation out.
//
// No Angular, no injection, no signals — so the folding rules can be tested against a
// captured `/identity/menu` payload without standing anything up. MenuAccessService owns
// the state; this file owns the logic.
// ─────────────────────────────────────────────────────────────────────────────

/** A navigation destination, folded from one or more legacy menu rows. */
export interface TransformedNavItem {
  label: string;
  icon: string;
  route: string;
  /** Every legacy menu row that folded into this destination. Never empty for menu-derived items. */
  menuIds: number[];
  /** Tabs of this destination the user actually holds, in blueprint order. */
  tabs: string[];
  /** Legacy labels of the folded rows — the command palette's search aliases. */
  aliases: string[];
  /** True when the destination is not built yet and routes to the legacy placeholder. */
  pending: boolean;
}

export interface TransformedNavSection {
  label: string;
  items: TransformedNavItem[];
}

/** A menu row the blueprint matched by name rather than by id — a mapping to correct. */
export interface MenuNearMiss {
  menuId: number;
  name: string;
  matchedEntryMenuId: number;
}

export interface MenuTransformResult {
  sections: TransformedNavSection[];
  /** Every granted menuId, flattened. The gating set. */
  grantedMenuIds: ReadonlySet<number>;
  /** Granted rows with no blueprint entry at all. Surfaced, never dropped. */
  unmapped: MenuItemResponse[];
  /** Granted rows matched by name because their menuId was not in the blueprint. */
  nearMisses: MenuNearMiss[];
}

// Group render order. Administration sits last because it is the least-used group for
// most of the user base, and the sidebar reads top-down by frequency.
const GROUP_ORDER: readonly string[] = [
  NAV_GROUP_TRADE,
  NAV_GROUP_INSIGHTS,
  NAV_GROUP_OPERATIONS,
  NAV_GROUP_ADMIN,
  NAV_GROUP_MORE,
];

/**
 * FontAwesome 4 (what the legacy menu stores in `icon`) to Tabler (what we render).
 * Only 34 of 95 rows carry an icon at all, and only root rows in practice — the rest fall
 * back to the blueprint's icon, then to a generic one. An unmapped FA name is not an
 * error; it just falls through to the default.
 */
const FA4_TO_TABLER: Readonly<Record<string, string>> = {
  cogs: 'settings',
  clipboard: 'clipboard',
  money: 'cash',
  'pencil-square-o': 'pencil',
  'envelope-o': 'mail',
  'stack-overflow': 'database-cog',
  check: 'check',
  'files-o': 'files',
  flash: 'bolt',
  tachometer: 'gauge',
  retweet: 'refresh',
  'shopping-cart': 'shopping-cart',
  'bar-chart-o': 'chart-bar',
  desktop: 'device-desktop',
  'flag-o': 'flag',
};

const DEFAULT_ICON = 'circle-dot';

export function tablerIconFor(legacyIcon: string | null | undefined): string | null {
  if (!legacyIcon) {
    return null;
  }
  return FA4_TO_TABLER[legacyIcon] ?? null;
}

/** One menu row plus the context the fold needs: its parent, and its render order. */
interface WalkedRow {
  row: MenuItemResponse;
  menuId: number;
  parent: WalkedRow | null;
  order: number;
}

/** Flattens the two-level tree, keeping each row's parent. */
function walkTree(nodes: readonly MenuItemResponse[]): WalkedRow[] {
  const out: WalkedRow[] = [];
  const visit = (list: readonly MenuItemResponse[], parent: WalkedRow | null): void => {
    for (const row of list) {
      const walked: WalkedRow = { row, menuId: int(row.menuId, -1), parent, order: out.length };
      out.push(walked);
      if (row.children?.length) {
        visit(row.children, walked);
      }
    }
  };
  visit(nodes, null);
  return out;
}

/**
 * menuId first, then name as a guarded fallback.
 *
 * The guard matters: names are not unique. "Perfect Store" is menuId 76 (a root module)
 * and menuId 85 (a screen under Dashboard). Without the `grantedMenuIds` check, row 85
 * would name-match the blueprint entry for 76 and silently fold a Dashboard screen into
 * the Perfect Store module. So a name match is accepted **only** when the entry's own
 * menuId is absent from this payload — i.e. only when it is genuinely standing in for a
 * row whose id has drifted, which is the one case the fallback exists for.
 */
function resolveEntry(
  walked: WalkedRow,
  grantedMenuIds: ReadonlySet<number>,
  nearMisses: MenuNearMiss[],
): MenuBlueprintEntry | null {
  const direct = BLUEPRINT_BY_MENU_ID.get(walked.menuId);
  if (direct) {
    return direct;
  }
  const byName = BLUEPRINT_BY_NAME.get(normaliseMenuName(walked.row.name));
  if (byName && !grantedMenuIds.has(byName.menuId)) {
    nearMisses.push({
      menuId: walked.menuId,
      name: walked.row.name,
      matchedEntryMenuId: byName.menuId,
    });
    return byName;
  }
  return null;
}

interface Accumulator {
  entry: MenuBlueprintEntry;
  label: string;
  icon: string;
  group: string;
  menuIds: number[];
  tabs: string[];
  aliases: string[];
  pending: boolean;
  /**
   * Deliberately absent from the sidebar. True only while *every* contributing entry says
   * so — one granted row that belongs in the nav is enough to put the destination there.
   */
  hidden: boolean;
  /** Position of the first contributing row, so nav order follows the legacy order. */
  order: number;
}

/**
 * Folds the granted menu tree into navigation.
 *
 * The fold is the whole point: seven legacy rows (Create User, Change User Details, Assign
 * Role to User, User Region Mapping, User Brand Mapping, Access Control, Employee
 * Resignation) share `route: '/admin/users'` in the blueprint, so they accumulate into one
 * nav item carrying seven `menuIds` and up to six `tabs`. A user granted only "User Brand
 * Mapping" still gets the Users screen — with exactly one tab on it.
 */
export function transformMenu(menu: readonly MenuItemResponse[]): MenuTransformResult {
  const rows = walkTree(menu).filter((walked) => walked.menuId >= 0);
  const grantedMenuIds = new Set<number>(rows.map((walked) => walked.menuId));
  const unmapped: MenuItemResponse[] = [];
  const nearMisses: MenuNearMiss[] = [];
  const byRoute = new Map<string, Accumulator>();

  // Resolve every row's blueprint entry up front, so the fold can ask about a row's
  // parent and children without re-resolving them.
  const entryOf = new Map<number, MenuBlueprintEntry | null>();
  for (const walked of rows) {
    entryOf.set(walked.menuId, resolveEntry(walked, grantedMenuIds, nearMisses));
  }
  const hasMappedChild = new Set<number>();
  for (const walked of rows) {
    if (walked.parent && entryOf.get(walked.menuId)) {
      hasMappedChild.add(walked.parent.menuId);
    }
  }

  const contribute = (
    entry: MenuBlueprintEntry,
    walked: WalkedRow,
    tab: string | undefined,
  ): void => {
    const existing = byRoute.get(entry.route);
    if (!existing) {
      byRoute.set(entry.route, {
        entry,
        label: entry.navLabel ?? walked.row.name,
        icon: entry.icon ?? tablerIconFor(walked.row.icon) ?? DEFAULT_ICON,
        group: entry.group ?? '',
        menuIds: [walked.menuId],
        tabs: tab ? [tab] : [],
        aliases: [walked.row.name],
        pending: entry.ported !== true,
        hidden: entry.hidden === true,
        order: walked.order,
      });
      return;
    }
    existing.menuIds.push(walked.menuId);
    existing.aliases.push(walked.row.name);
    if (tab && !existing.tabs.includes(tab)) {
      existing.tabs.push(tab);
    }
    // The row that *names* the destination may arrive after a tab row — "Create User"
    // carries the navLabel but "Change User Details" could be granted alone. Let whichever
    // arrives with the naming fields upgrade the accumulator.
    if (entry.navLabel) {
      existing.label = entry.navLabel;
    }
    if (entry.icon) {
      existing.icon = entry.icon;
    }
    if (entry.group) {
      existing.group = entry.group;
    }
    // A destination is pending only while *every* contributing row is unported.
    if (entry.ported) {
      existing.pending = false;
    }
    if (entry.hidden !== true) {
      existing.hidden = false;
    }
    existing.order = Math.min(existing.order, walked.order);
  };

  for (const walked of rows) {
    const entry = entryOf.get(walked.menuId) ?? null;

    if (entry) {
      // A row with no group and no navLabel is a destination that deliberately never
      // appears in the sidebar — "Edit Password" lives in the avatar menu. It still
      // contributes its menuId to the gating set, which is what matters.
      contribute(entry, walked, entry.tab);
      continue;
    }

    // ── Unmapped rows ────────────────────────────────────────────────────────
    // The legacy menu is two levels: a module and its screens. An unmapped *child*
    // ("BRD Schemes" under "FSD Bulk Schemes") is a screen of a module we already have a
    // destination for — folding it in gives one nav item whose aliases still make the
    // child findable in the command palette. Promoting it to its own top-level entry
    // instead would produce a sidebar of 88 items, which is worse than the legacy menu
    // this transform exists to improve on.
    const parentEntry = walked.parent ? (entryOf.get(walked.parent.menuId) ?? null) : null;
    if (parentEntry) {
      contribute(parentEntry, walked, undefined);
      continue;
    }

    // The parent is unmapped too, but it already produced a fallback destination of its
    // own (below). Fold into that rather than promoting the child alongside its parent —
    // otherwise a wholly-unknown module renders as one nav item per screen.
    if (walked.parent && byRoute.has(`/legacy/${walked.parent.menuId}`)) {
      contribute(
        {
          menuId: walked.parent.menuId,
          legacyName: walked.parent.row.name,
          route: `/legacy/${walked.parent.menuId}`,
        },
        walked,
        undefined,
      );
      continue;
    }

    // An unmapped *parent* whose children are mapped ("Administration 1.0") is a grouping
    // header, not a destination. Its children already produced the destinations; emitting
    // it too would duplicate them under a redundant nav item.
    if (hasMappedChild.has(walked.menuId)) {
      continue;
    }

    // Genuinely unmapped and standalone. It still renders — under More, pointing at the
    // placeholder — so a menu row the backend adds tomorrow is visible rather than
    // invisible. This is the rule that keeps the blueprint safe to be incomplete.
    unmapped.push(walked.row);
    const fallbackRoute = `/legacy/${walked.menuId}`;
    contribute(
      {
        menuId: walked.menuId,
        legacyName: walked.row.name,
        route: fallbackRoute,
        navLabel: walked.row.name,
        group: NAV_GROUP_MORE,
        ported: false,
      },
      walked,
      undefined,
    );
  }

  // Screens with no legacy menu row of their own. Gated separately — see menu-blueprint.
  const canSeeAccessExplorer = ACCESS_EXPLORER_GATED_ON.some((id) => grantedMenuIds.has(id));
  if (canSeeAccessExplorer && !byRoute.has(ACCESS_EXPLORER_ROUTE)) {
    byRoute.set(ACCESS_EXPLORER_ROUTE, {
      entry: { menuId: -1, legacyName: 'Access Explorer', route: ACCESS_EXPLORER_ROUTE },
      label: 'Access Explorer',
      icon: 'list-search',
      group: NAV_GROUP_ADMIN,
      menuIds: [],
      tabs: [],
      aliases: ['User Roles', 'User Regions', 'User Brands', 'User Menus', 'Role Menus'],
      pending: false,
      hidden: false,
      order: Number.MAX_SAFE_INTEGER - 2,
    });
  }

  const sections = assembleSections(byRoute);
  return { sections, grantedMenuIds, unmapped, nearMisses };
}

/**
 * Adds the routes gated on `isAdmin` rather than on a menu grant ("Add Menu", "Frequency
 * Configuration" — both fully specified in the contract, neither present in the menu).
 * Kept separate from `transformMenu` because it depends on the user record, not the menu.
 */
export function withAdminOnlyRoutes(
  sections: readonly TransformedNavSection[],
  isAdmin: boolean,
): TransformedNavSection[] {
  if (!isAdmin) {
    return sections.map((section) => ({ ...section, items: [...section.items] }));
  }

  const next = sections.map((section) => ({ ...section, items: [...section.items] }));
  for (const route of ADMIN_ONLY_ROUTES) {
    if (next.some((section) => section.items.some((item) => item.route === route.route))) {
      continue;
    }
    const item: TransformedNavItem = {
      label: route.navLabel,
      icon: route.icon,
      route: route.route,
      menuIds: [],
      tabs: [],
      aliases: [route.navLabel],
      pending: route.route !== '/admin/menus',
    };
    const section = next.find((candidate) => candidate.label === route.group);
    if (section) {
      section.items.push(item);
    } else {
      next.push({ label: route.group, items: [item] });
    }
  }
  return next;
}

function assembleSections(byRoute: ReadonlyMap<string, Accumulator>): TransformedNavSection[] {
  const grouped = new Map<string, Accumulator[]>();
  for (const accumulator of byRoute.values()) {
    // Only an explicit `hidden` keeps a destination out of the sidebar. A destination can
    // otherwise end up group-less by accident — the row carrying the group may not be
    // granted to this user (someone with "Re-Route Scheme" but not "Hierarchy") — and
    // dropping it there would hide a screen they legitimately hold.
    if (accumulator.hidden) {
      continue;
    }
    const group = accumulator.group || NAV_GROUP_MORE;
    const bucket = grouped.get(group);
    if (bucket) {
      bucket.push(accumulator);
    } else {
      grouped.set(group, [accumulator]);
    }
  }

  const orderOf = (group: string): number => {
    const index = GROUP_ORDER.indexOf(group);
    return index === -1 ? GROUP_ORDER.length : index;
  };

  return [...grouped.entries()]
    .sort(([a], [b]) => orderOf(a) - orderOf(b) || a.localeCompare(b))
    .map(([label, accumulators]) => ({
      label,
      items: accumulators
        .sort((a, b) => a.order - b.order)
        .map((accumulator) => ({
          label: accumulator.label,
          icon: accumulator.icon,
          route: accumulator.entry.route,
          menuIds: accumulator.menuIds,
          tabs: accumulator.tabs,
          aliases: accumulator.aliases,
          pending: accumulator.pending,
        })),
    }));
}
