import { Injectable, computed, inject, signal } from '@angular/core';

import { environment } from '../../../environments/environment';
import { MOCK_USERS } from '../models/mock-users.data';
import { Role } from '../models/role.model';
import { UserContext } from '../models/user-context.model';
import { PermissionService } from './permission.service';

const STORAGE_KEY = 'to-mock-active-role';

// Auth is currently mocked (CLAUDE.md §3). When real auth lands, this service
// swaps to angular-auth-oidc-client (Keycloak or EntraID — TBD by client);
// PermissionService and the rest of the app are unaffected by the swap since
// they only depend on UserContext, not on how it was resolved.
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly permissionService = inject(PermissionService);

  private readonly activeRoleSignal = signal<Role | null>(null);
  readonly activeRole = this.activeRoleSignal.asReadonly();
  readonly isAuthenticated = computed(() => this.activeRoleSignal() !== null);
  readonly availableRoles: Role[] = Object.keys(MOCK_USERS) as Role[];

  /** Restores the last-used mock role from localStorage, if any. Call once at bootstrap. */
  restoreSession(): void {
    if (!environment.useMocks) {
      return;
    }
    const storedRole = localStorage.getItem(STORAGE_KEY) as Role | null;
    if (storedRole && MOCK_USERS[storedRole]) {
      this.loginAs(storedRole);
    }
  }

  /** Mock login — sets the active user context for the given role without a credential flow. */
  loginAs(role: Role): void {
    const user = MOCK_USERS[role];
    if (!user) {
      return;
    }
    this.activeRoleSignal.set(role);
    this.permissionService.setContext(user);
    if (environment.useMocks) {
      localStorage.setItem(STORAGE_KEY, role);
    }
  }

  logout(): void {
    this.activeRoleSignal.set(null);
    this.permissionService.clearContext();
    localStorage.removeItem(STORAGE_KEY);
  }

  currentUser(): UserContext {
    return this.permissionService.context();
  }

  /** Bearer token for the auth interceptor. Mock token echoes the active role. */
  getToken(): string | null {
    const role = this.activeRoleSignal();
    return role ? `mock-token.${role}` : null;
  }
}
