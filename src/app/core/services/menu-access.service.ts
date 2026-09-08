import { Injectable, computed, signal } from '@angular/core';

import { UserMenuResponse } from '../api/identity.models';
import { ADMINISTRATION_MENU_IDS } from '../menu/menu-blueprint';
import {
  MenuTransformResult,
  TransformedNavItem,
  TransformedNavSection,
  transformMenu,
  withAdminOnlyRoutes,
} from '../menu/menu-transform';
import { environment } from '../../../environments/environment';

// ─────────────────────────────────────────────────────────────────────────────
// The application's access model.
//
// This replaces the permission-string model the POC was built on (`BUDGET_VIEW`,
// `ADMIN_USER_MANAGE`, `ACCESS_TEMPLATES`). Those strings were invented from KT notes and
// have **no server-side counterpart** — the API has no permission concept at all. What it
// has is menu grants:
//
//     user → roles → menu grants  ∪  user → direct menu grants  =  effectiveMenuIds
//
// and `GET /admin/users/{id}/access` is explicit that effectiveMenuIds "is what actually
// authorizes requests". So the frontend gates on the same set the server does, which is
// the only way the two can agree.
//
// Nothing here decides access. It reads what the server granted and reflects it.
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_RESULT: MenuTransformResult = {
  sections: [],
  grantedMenuIds: new Set<number>(),
  unmapped: [],
  nearMisses: [],
};

@Injectable({ providedIn: 'root' })
export class MenuAccessService {
  private readonly menuResponse = signal<UserMenuResponse | null>(null);

  /** Role *names* as reported by `/identity/menu`. The only place roles are published. */
  readonly roles = computed(() => this.menuResponse()?.role ?? []);
  readonly userId = computed(() => this.menuResponse()?.userId ?? '');
  readonly isAuthenticated = computed(() => this.menuResponse() !== null);

  /**
   * Derived from the grants themselves — see ADMINISTRATION_MENU_IDS for why this is not
   * read from a flag. Gates the two admin screens that have no menu row of their own.
   */
  readonly isAdmin = computed(() => this.hasAnyMenu(ADMINISTRATION_MENU_IDS));

  private readonly transformed = computed<MenuTransformResult>(() => {
    const response = this.menuResponse();
    return response ? transformMenu(response.menu) : EMPTY_RESULT;
  });

  /** The sidebar's sections — the legacy menu, folded. */
  readonly sections = computed<TransformedNavSection[]>(() =>
    withAdminOnlyRoutes(this.transformed().sections, this.isAdmin()),
  );

  /** Every granted menuId. The gating set. */
  readonly grantedMenuIds = computed(() => this.transformed().grantedMenuIds);

  /** Flattened nav items, for route lookups and the command palette. */
  readonly navItems = computed<TransformedNavItem[]>(() =>
    this.sections().flatMap((section) => section.items),
  );

  /**
   * Command-palette entries. Every folded legacy label points at the destination that
   * absorbed it, so someone trained on the legacy system can still type "Re-Route Scheme"
   * or "User Brand Mapping" and land in the right place. This is what makes the menu
   * revamp safe for UAT: the names people were taught do not stop working.
   */
  readonly searchEntries = computed(() =>
    this.navItems().flatMap((item) =>
      [item.label, ...item.aliases]
        .filter((term, index, all) => all.indexOf(term) === index)
        .map((term) => ({
          term,
          label: item.label,
          route: item.route,
          isAlias: term !== item.label,
          pending: item.pending,
        })),
    ),
  );

  /** Menu rows with no blueprint entry. Surfaced so an incomplete map is visible, not silent. */
  readonly unmapped = computed(() => this.transformed().unmapped);
  /** Rows matched by name because their menuId drifted — mappings to correct. */
  readonly nearMisses = computed(() => this.transformed().nearMisses);

  setMenu(response: UserMenuResponse): void {
    this.menuResponse.set(response);

    if (!environment.production) {
      this.reportMappingGaps();
    }
  }

  clear(): void {
    this.menuResponse.set(null);
  }

  /** Does the user hold this specific legacy menu row? */
  hasMenu(menuId: number): boolean {
    return this.grantedMenuIds().has(menuId);
  }

  hasAnyMenu(menuIds: readonly number[]): boolean {
    const granted = this.grantedMenuIds();
    return menuIds.some((menuId) => granted.has(menuId));
  }

  /**
   * Can the user reach this route?
   *
   * A route is reachable when the fold produced a nav item for it — which happens only if
   * at least one contributing menu row was granted. Routes with no menu row of their own
   * (`/admin/menus`, `/admin/frequency`) are added by `withAdminOnlyRoutes` and so are
   * covered by the same lookup.
   *
   * Matching is prefix-aware on path segments so `/admin/users/jdoe` resolves via
   * `/admin/users` — detail routes are not separately granted.
   */
  canAccessRoute(route: string): boolean {
    return this.navItemFor(route) !== undefined;
  }

  navItemFor(route: string): TransformedNavItem | undefined {
    const path = route.split('?')[0].split('#')[0];
    let best: TransformedNavItem | undefined;
    for (const item of this.navItems()) {
      if (path === item.route || path.startsWith(`${item.route}/`)) {
        // Longest match wins, so /admin/users/x/y does not resolve to a shorter sibling.
        if (!best || item.route.length > best.route.length) {
          best = item;
        }
      }
    }
    return best;
  }

  /**
   * Can the user see this tab of this screen?
   *
   * Tabs are the folded legacy rows. Someone granted "User Brand Mapping" but not "Access
   * Control" gets the Users screen with a Brands tab and no Access tab — the same
   * granularity legacy enforced with separate menu items, now expressed as tabs.
   */
  canAccessTab(route: string, tab: string): boolean {
    return this.navItemFor(route)?.tabs.includes(tab) ?? false;
  }

  /** The tabs of a screen the user actually holds, in fold order. */
  tabsFor(route: string): string[] {
    return this.navItemFor(route)?.tabs ?? [];
  }

  /**
   * Development-time reporting of blueprint gaps. A frontend-maintained mapping is only
   * safe if the gaps are loud — an unmapped row still renders (under More), but it should
   * be *noticed* here rather than in a support ticket.
   */
  private reportMappingGaps(): void {
    const { unmapped, nearMisses } = this.transformed();
    if (unmapped.length > 0) {
      console.warn(
        `[menu-blueprint] ${unmapped.length} menu row(s) have no blueprint entry and fell back to /legacy/*:`,
        unmapped.map((row) => `${String(row.menuId)}: ${row.name}`),
      );
    }
    if (nearMisses.length > 0) {
      console.warn(
        '[menu-blueprint] menuId drift — these rows matched by name. Correct their ids in menu-blueprint.ts:',
        nearMisses,
      );
    }
  }
}
