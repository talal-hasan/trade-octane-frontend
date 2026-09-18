import { Routes } from '@angular/router';

import { AdminOnlyGuard, MenuGuard, MenuTabGuard } from './core/guards/menu.guard';
import { MocksOnlyGuard } from './core/guards/mocks-only.guard';
import { PermissionGuard } from './core/guards/permission.guard';
import { UnsavedChangesGuard } from './core/guards/unsaved-changes.guard';

// ─────────────────────────────────────────────────────────────────────────────
// Two gates coexist here, deliberately, and the split is temporary.
//
//   MenuGuard        the real model. Gates on the user's menu grants, which is what the
//                    server authorises on. Every Administration route uses it, and it
//                    needs no route data — the blueprint already maps rows to routes.
//
//   PermissionGuard  the POC model. Gates on invented permission strings that have no
//                    server counterpart. Still in place for the pre-existing demo screens
//                    (budget, schemes, claims) so client vetting keeps working.
//
// As each POC module moves onto its real contract, move its route to MenuGuard and delete
// its `requiredPermission`. When the last one goes, PermissionGuard and PermissionService
// go with it.
// ─────────────────────────────────────────────────────────────────────────────

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [MenuGuard],
    data: { public: true },
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      // Landing page. No grant of its own — every signed-in user gets a landing page; what
      // appears on it is what they can access.
      {
        path: 'dashboard',
        data: { public: true },
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'workspace',
        data: { public: true },
        loadComponent: () =>
          import('./features/workspace/workspace.component').then((m) => m.WorkspaceComponent),
      },

      // ─── Administration 1.0 ────────────────────────────────────────────────
      // Fifteen legacy menu rows, six destinations. Tab-level access is enforced inside
      // each screen from MenuAccessService.tabsFor(), not by child routes, because the
      // tabs are facets of one record and deep-linking them separately would re-create
      // the fifteen-errand menu this consolidation removes.
      {
        path: 'admin/users',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/users/user-list/user-list.component').then(
            (m) => m.UserListComponent,
          ),
      },
      {
        path: 'admin/users/new',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/users/user-create/user-create.component').then(
            (m) => m.UserCreateComponent,
          ),
      },
      {
        path: 'admin/users/:userId',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/users/user-detail/user-detail.component').then(
            (m) => m.UserDetailComponent,
          ),
      },
      {
        path: 'admin/roles',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/roles/role-list/role-list.component').then(
            (m) => m.RoleListComponent,
          ),
      },
      {
        // Ahead of ':roleId' so it isn't swallowed by it. Gated on AdminOnlyGuard, not just
        // MenuGuard: 'Access Control | By Role' reaches the roles list and each role's
        // access tree, but creating a role has no legacy menu row of its own — see
        // AdminOnlyGuard.
        path: 'admin/roles/new',
        canActivate: [MenuGuard, AdminOnlyGuard],
        loadComponent: () =>
          import('./features/admin/roles/role-create/role-create.component').then(
            (m) => m.RoleCreateComponent,
          ),
      },
      {
        path: 'admin/roles/:roleId',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/roles/role-access/role-access.component').then(
            (m) => m.RoleAccessComponent,
          ),
      },
      {
        path: 'admin/access-explorer',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/access-explorer/access-explorer.component').then(
            (m) => m.AccessExplorerComponent,
          ),
      },
      {
        path: 'admin/menus',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/menus/menu-list/menu-list.component').then(
            (m) => m.MenuListComponent,
          ),
      },
      {
        path: 'admin/menus/new',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/menus/menu-form/menu-form.component').then(
            (m) => m.MenuFormComponent,
          ),
      },
      {
        path: 'admin/menus/:menuId',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/menus/menu-form/menu-form.component').then(
            (m) => m.MenuFormComponent,
          ),
      },
      {
        path: 'admin/approval-routing',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/approval-routing/approval-routing.component').then(
            (m) => m.ApprovalRoutingComponent,
          ),
      },
      {
        path: 'admin/ownership',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/ownership/ownership.component').then(
            (m) => m.OwnershipComponent,
          ),
      },
      {
        path: 'admin/activity-logs',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/activity-logs/activity-logs.component').then(
            (m) => m.ActivityLogsComponent,
          ),
      },
      {
        path: 'admin/frequency',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/frequency/frequency.component').then(
            (m) => m.FrequencyComponent,
          ),
      },
      {
        path: 'admin/integration',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin/integration/integration.component').then(
            (m) => m.IntegrationComponent,
          ),
      },

      // ─── Administration 2.0 ────────────────────────────────────────────────
      // The CPS_* screens, over Promo_Management_2. Unported 2.0 rows fold into
      // /legacy/92 — see ADMINISTRATION_2 in menu-blueprint.ts.
      {
        path: 'admin2/distributors',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin2/distributors/distributor-list/distributor-list.component').then(
            (m) => m.DistributorListComponent,
          ),
      },
      {
        // Ahead of ':distributorId' so "new" is not read as an id. Create and edit are the
        // same legacy menu row, so MenuGuard's prefix match on /admin2/distributors covers both.
        path: 'admin2/distributors/new',
        canActivate: [MenuGuard],
        canDeactivate: [UnsavedChangesGuard],
        loadComponent: () =>
          import('./features/admin2/distributors/distributor-form/distributor-form.component').then(
            (m) => m.DistributorFormComponent,
          ),
      },
      {
        // One screen: the distributor grid is the picker, and the menu tree beside it is
        // what every ticked distributor will hold.
        path: 'admin2/distributor-access',
        canActivate: [MenuGuard],
        canDeactivate: [UnsavedChangesGuard],
        loadComponent: () =>
          import('./features/admin2/distributor-access/distributor-access.component').then(
            (m) => m.DistributorAccessComponent,
          ),
      },
      {
        path: 'admin2/roles',
        canActivate: [MenuGuard],
        loadComponent: () =>
          import('./features/admin2/roles/role-list/role-list.component').then(
            (m) => m.Admin2RoleListComponent,
          ),
      },
      {
        // The Roles destination folds two legacy rows as tabs: Create Role (88) is `details`,
        // Access Control | By Role (154) is `access`. MenuTabGuard sends a holder of only one
        // back to the list rather than into the other.
        path: 'admin2/roles/new',
        canActivate: [MenuGuard, MenuTabGuard],
        canDeactivate: [UnsavedChangesGuard],
        data: { tab: 'details' },
        loadComponent: () =>
          import('./features/admin2/roles/role-form/role-form.component').then(
            (m) => m.Admin2RoleFormComponent,
          ),
      },
      {
        // The Administration 1.0 role access screen, over the Octane 2 menu.
        path: 'admin2/roles/:roleId/access',
        canActivate: [MenuGuard, MenuTabGuard],
        data: { adminApiRoot: 'admin2', tab: 'access' },
        loadComponent: () =>
          import('./features/admin/roles/role-access/role-access.component').then((m) => m.RoleAccessComponent),
      },
      {
        path: 'admin2/roles/:roleId',
        canActivate: [MenuGuard, MenuTabGuard],
        canDeactivate: [UnsavedChangesGuard],
        data: { tab: 'details' },
        loadComponent: () =>
          import('./features/admin2/roles/role-form/role-form.component').then(
            (m) => m.Admin2RoleFormComponent,
          ),
      },
      {
        // One screen: bands are edited beside their neighbours, not on a separate route.
        path: 'admin2/level-of-authorities',
        canActivate: [MenuGuard],
        canDeactivate: [UnsavedChangesGuard],
        loadComponent: () =>
          import('./features/admin2/level-of-authorities/level-of-authorities.component').then(
            (m) => m.LevelOfAuthoritiesComponent,
          ),
      },
      {
        // One screen: the business type is `?businessType=<id>`, so a hierarchy can be linked to.
        path: 'admin2/claim-hierarchy',
        canActivate: [MenuGuard],
        canDeactivate: [UnsavedChangesGuard],
        loadComponent: () =>
          import('./features/admin2/claim-hierarchy/claim-hierarchy.component').then((m) => m.ClaimHierarchyComponent),
      },
      {
        // The Administration 1.0 screen over the 2.0 log: the backend serves the same report
        // under /admin2, and the component picks the endpoints from this route data.
        path: 'admin2/activity-logs',
        canActivate: [MenuGuard],
        data: { adminApiRoot: 'admin2' },
        loadComponent: () =>
          import('./features/admin/activity-logs/activity-logs.component').then((m) => m.ActivityLogsComponent),
      },
      {
        // Both tabs — Map a user and Roles by region — are the one legacy row (91), so they
        // are one route with the tab and the account in the query string.
        path: 'admin2/user-mapping',
        canActivate: [MenuGuard],
        canDeactivate: [UnsavedChangesGuard],
        loadComponent: () =>
          import('./features/admin2/user-mapping/user-mapping.component').then((m) => m.UserMappingComponent),
      },
      {
        path: 'admin2/distributors/:distributorId',
        canActivate: [MenuGuard],
        canDeactivate: [UnsavedChangesGuard],
        loadComponent: () =>
          import('./features/admin2/distributors/distributor-form/distributor-form.component').then(
            (m) => m.DistributorFormComponent,
          ),
      },

      // The signed-in user's own account. Reached from the avatar menu, never the sidebar.
      {
        path: 'account',
        data: { public: true },
        loadComponent: () =>
          import('./features/account/account.component').then((m) => m.AccountComponent),
      },

      // ─── POC screens, still on the permission model ─────────────────────────
      {
        path: 'budget',
        canActivate: [PermissionGuard],
        data: { requiredPermission: 'BUDGET_VIEW' },
        loadComponent: () =>
          import('./features/budget/budget-list/budget-list.component').then(
            (m) => m.BudgetListComponent,
          ),
      },
      {
        path: 'schemes',
        canActivate: [PermissionGuard],
        data: { requiredPermission: 'SCHEME_VIEW' },
        loadComponent: () =>
          import('./features/schemes/scheme-status-board/scheme-status-board.component').then(
            (m) => m.SchemeStatusBoardComponent,
          ),
      },
      {
        path: 'claims',
        canActivate: [PermissionGuard],
        data: { requiredPermission: 'CLAIMS_VIEW' },
        loadComponent: () =>
          import('./features/claims/claims-list/claims-list.component').then(
            (m) => m.ClaimsListComponent,
          ),
      },
      {
        path: 'claims/new',
        canActivate: [PermissionGuard],
        data: { requiredPermission: 'CLAIMS_VIEW' },
        loadComponent: () =>
          import('./features/claims/claim-form/claim-form.component').then(
            (m) => m.ClaimFormComponent,
          ),
      },
      {
        path: 'claims/:id',
        canActivate: [PermissionGuard],
        data: { requiredPermission: 'CLAIMS_VIEW' },
        loadComponent: () =>
          import('./features/claims/claim-detail/claim-detail.component').then(
            (m) => m.ClaimDetailComponent,
          ),
      },

      // Granted, but not ported. See LegacyPlaceholderComponent for why these render at
      // all rather than being filtered out of the nav.
      {
        path: 'legacy/:menuId',
        data: { public: true },
        loadComponent: () =>
          import('./features/legacy/legacy-placeholder.component').then(
            (m) => m.LegacyPlaceholderComponent,
          ),
      },

      {
        path: 'style-guide',
        canActivate: [MocksOnlyGuard],
        data: { public: true },
        loadComponent: () =>
          import('./style-guide/style-guide.component').then((m) => m.StyleGuideComponent),
      },
      {
        path: 'access-denied',
        data: { public: true },
        loadComponent: () =>
          import('./features/access-denied/access-denied.component').then(
            (m) => m.AccessDeniedComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
