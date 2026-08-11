import { Injectable, computed, signal } from '@angular/core';

import { Role } from '../models/role.model';
import { UserContext } from '../models/user-context.model';

const EMPTY_CONTEXT: UserContext = {
  userId: '',
  name: '',
  roles: [],
  regions: [],
  brands: [],
  permissions: [],
};

@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly userContext = signal<UserContext>(EMPTY_CONTEXT);

  readonly context = this.userContext.asReadonly();
  readonly roles = computed(() => this.userContext().roles);
  readonly isAuthenticated = computed(() => this.userContext().userId !== '');

  setContext(context: UserContext): void {
    this.userContext.set(context);
  }

  clearContext(): void {
    this.userContext.set(EMPTY_CONTEXT);
  }

  canAccess(permission: string): boolean {
    return this.userContext().permissions.includes(permission);
  }

  hasRole(role: Role): boolean {
    return this.userContext().roles.includes(role);
  }

  hasAnyRole(roles: Role[]): boolean {
    const current = this.userContext().roles;
    return roles.some((role) => current.includes(role));
  }
}
