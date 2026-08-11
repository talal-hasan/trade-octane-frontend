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
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { loadingInterceptor } from './core/interceptors/loading.interceptor';
import { AuthService } from './core/services/auth.service';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { ApprovalsService } from './features/dashboard/services/approvals.service';
import { MockApprovalsService } from './features/dashboard/services/mock-approvals.service';
import { BudgetService } from './features/budget/services/budget.service';
import { MockBudgetService } from './features/budget/services/mock-budget.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, loadingInterceptor, errorInterceptor])),
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    MessageService,
    // Feature service bindings (CLAUDE.md §3 mock-first). Swap the mock for the real
    // HTTP-backed service here — one line per feature, zero component changes.
    { provide: ApprovalsService, useClass: MockApprovalsService },
    { provide: BudgetService, useClass: MockBudgetService },
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
