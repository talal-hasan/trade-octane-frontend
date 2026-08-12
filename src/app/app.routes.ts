import { Routes } from '@angular/router';

import { MocksOnlyGuard } from './core/guards/mocks-only.guard';
import { PermissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [PermissionGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
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
        path: 'style-guide',
        canActivate: [MocksOnlyGuard],
        loadComponent: () =>
          import('./style-guide/style-guide.component').then((m) => m.StyleGuideComponent),
      },
      {
        path: 'access-denied',
        loadComponent: () =>
          import('./features/access-denied/access-denied.component').then(
            (m) => m.AccessDeniedComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
