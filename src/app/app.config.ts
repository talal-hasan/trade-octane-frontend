import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';

import { TradeOctanePreset } from './core/config/prime-preset';
import { HttpIdentityApi, IdentityApi, MockIdentityApi } from './core/api/identity.api';
import { environment } from '../environments/environment';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { AuthService } from './core/services/auth.service';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { ApprovalsService } from './features/workspace/services/approvals.service';
import { MockApprovalsService } from './features/workspace/services/mock-approvals.service';
import { BudgetService } from './features/budget/services/budget.service';
import { MockBudgetService } from './features/budget/services/mock-budget.service';
import { ClaimsService } from './features/claims/services/claims.service';
import { MockClaimsService } from './features/claims/services/mock-claims.service';
import { SchemesService } from './features/schemes/services/schemes.service';
import { MockSchemesService } from './features/schemes/services/mock-schemes.service';
import { DashboardService } from './features/dashboard/services/dashboard.service';
import { MockDashboardService } from './features/dashboard/services/mock-dashboard.service';
import { AdminUsersService } from './features/admin/user-management/services/admin-users.service';
import { MockAdminUsersService } from './features/admin/user-management/services/mock-admin-users.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, errorInterceptor])),
    // Restores the session *before* the first route resolves, so MenuGuard is never asked
    // to gate a route against a menu that has not loaded yet. Returning the observable is
    // what makes Angular wait for it — dropping the return would reintroduce a race where
    // a refresh on a deep link bounces to /login.
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    MessageService,
    // Feature service bindings (CLAUDE.md §3 mock-first). Swap the mock for the real
    // HTTP-backed service here — one line per feature, zero component changes.
    { provide: ApprovalsService, useClass: MockApprovalsService },
    { provide: BudgetService, useClass: MockBudgetService },
    { provide: ClaimsService, useClass: MockClaimsService },
    { provide: SchemesService, useClass: MockSchemesService },
    { provide: DashboardService, useClass: MockDashboardService },
    { provide: AdminUsersService, useClass: MockAdminUsersService },
    // Identity is the one service that is menu-driven rather than screen-driven, so it is
    // bound here by environment rather than left permanently mocked. The mock serves a
    // captured *real* /identity/menu payload, so the menu fold, the nav and every gate run
    // on production-shaped data even during POC demos.
    { provide: IdentityApi, useClass: environment.useMocks ? MockIdentityApi : HttpIdentityApi },
    providePrimeNG({
      theme: {
        preset: TradeOctanePreset,
        options: {
          darkModeSelector: '[data-theme="dark"]',
          cssLayer: {
            name: 'primeng',
            order: 'reset, primeng, tokens',
          },
        },
      },
    }),
  ],
};
