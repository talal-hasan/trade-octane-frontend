import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { MenuAccessService } from '../services/menu-access.service';

/**
 * Route gate, backed by the user's real menu grants.
 *
 * This replaces `PermissionGuard`, which checked `route.data.requiredPermission` against
 * an invented permission catalogue. The server authorises on `effectiveMenuIds`, so this
 * does too — see MenuAccessService.
 *
 * **No route data is required.** The blueprint already records which legacy menu rows map
 * to which route, so asking the route to restate it would be a second copy of the mapping
 * that can disagree with the first. A route is reachable when the fold produced a nav
 * item for it. Mark the handful of routes that are reachable by every signed-in user with
 * `data: { public: true }` — the landing page, access-denied, the legacy placeholder.
 *
 * Checked before activation, so a forbidden screen is never flashed and then withdrawn
 * (CLAUDE.md §4).
 */
export const MenuGuard: CanActivateFn = (route, state) => {
  const menuAccess = inject(MenuAccessService);
  const router = inject(Router);

  if (!menuAccess.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  if (route.data['public'] === true) {
    return true;
  }

  if (menuAccess.canAccessRoute(state.url)) {
    return true;
  }

  return router.createUrlTree(['/access-denied']);
};

/**
 * Gates a route on `MenuAccessService.isAdmin` rather than a menu grant.
 *
 * Needed for destinations that sit *underneath* a route with its own real grant, where
 * `MenuGuard`'s prefix match would otherwise let anyone holding the parent through. Role
 * creation is exactly that case: `/admin/roles/:roleId` is reachable by anyone granted
 * "Access Control | By Role", but `POST /admin/roles` has no legacy counterpart at all —
 * nothing in the Web Forms application could create a role — so there is no menu row to
 * gate it on. `isAdmin` (holding any Administration 1.0 menu row) is the same signal
 * `withAdminOnlyRoutes` uses for "Add Menu" and "Frequency Configuration"; see
 * ADMINISTRATION_MENU_IDS for why it is derived rather than read off a flag.
 *
 * Combine with `MenuGuard` — this does not check authentication or the parent route.
 */
export const AdminOnlyGuard: CanActivateFn = () => {
  const menuAccess = inject(MenuAccessService);
  const router = inject(Router);

  return menuAccess.isAdmin() ? true : router.createUrlTree(['/access-denied']);
};

/**
 * Tab gate. A screen composed from several legacy menu rows shows only the tabs whose row
 * the user actually holds — someone granted "User Brand Mapping" but not "Access Control"
 * gets the Users screen with a Brands tab and no Access tab.
 *
 * Requires `data: { tab: 'brands' }` on the child route, since the tab is what is being
 * checked and the URL alone does not carry it in a form the blueprint indexes.
 */
export const MenuTabGuard: CanActivateFn = (route, state) => {
  const menuAccess = inject(MenuAccessService);
  const router = inject(Router);

  const tab = route.data['tab'] as string | undefined;
  if (!tab) {
    return true;
  }

  const item = menuAccess.navItemFor(state.url);
  if (item && item.tabs.includes(tab)) {
    return true;
  }

  // Fall back to the screen itself rather than access-denied: the user can reach the
  // screen, just not this facet of it, and bouncing them out of it entirely would be a
  // worse answer than showing them the tabs they do hold.
  return item ? router.createUrlTree([item.route]) : router.createUrlTree(['/access-denied']);
};
