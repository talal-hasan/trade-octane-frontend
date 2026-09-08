import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AdminUsersApi } from '../../features/admin/services/admin-users.api';
import { IdentityApi } from '../api/identity.api';
import { LoginResponse, LoginStatus } from '../api/identity.models';
import { int } from '../api/api.types';
import { MOCK_USERS } from '../models/mock-users.data';
import { Role } from '../models/role.model';
import { UserContext } from '../models/user-context.model';
import { MenuAccessService } from './menu-access.service';
import { PermissionService } from './permission.service';

const ROLE_STORAGE_KEY = 'to-mock-active-role';
const TOKEN_STORAGE_KEY = 'to-access-token';
const TOKEN_EXPIRY_KEY = 'to-access-token-expiry';

/** What the caller has to deal with after a successful credential check. */
export interface SignInOutcome {
  status: LoginStatus;
  /** Server-supplied message. Shown verbatim — it explains the status. */
  notice: string | null;
  daysUntilLock: number | null;
}

/**
 * Session and identity.
 *
 * Two paths, chosen by `environment.useMocks`:
 *
 *   mocks off  the real thing — `login_old` or SSO for the credential check, then
 *              `/identity/menu` for the grants that drive navigation and every gate.
 *   mocks on   the POC role switcher, so the pre-existing demo screens (claims, budgets,
 *              schemes, workspace) keep working for client vetting. Even here the menu is
 *              loaded — from a captured real payload — so the Administration screens and
 *              the menu fold are exercised on production-shaped data.
 *
 * The real path populates MenuAccessService, which is authoritative. PermissionService is
 * kept in step for the POC screens that still read it, and should be retired as each of
 * those screens moves onto the real contract.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly identityApi = inject(IdentityApi);
  private readonly usersApi = inject(AdminUsersApi);
  private readonly permissionService = inject(PermissionService);
  private readonly menuAccess = inject(MenuAccessService);

  private readonly activeRoleSignal = signal<Role | null>(null);
  private readonly tokenSignal = signal<string | null>(null);
  private readonly displayNameSignal = signal('');
  private readonly statusSignal = signal<LoginStatus | null>(null);
  private readonly noticeSignal = signal<string | null>(null);

  readonly activeRole = this.activeRoleSignal.asReadonly();
  readonly loginStatus = this.statusSignal.asReadonly();
  readonly notice = this.noticeSignal.asReadonly();
  readonly availableRoles: Role[] = Object.keys(MOCK_USERS) as Role[];

  /** Signed in *and* bootstrapped — a token alone is not a usable session. */
  readonly isAuthenticated = computed(() => this.menuAccess.isAuthenticated());

  /**
   * A password change the user cannot navigate away from. `login_old` can succeed with
   * `PasswordChangeRequired`, which is a successful credential check and an unusable
   * session at the same time — the shell must route to the change-password screen and the
   * guard must keep them there.
   */
  readonly mustChangePassword = computed(() => this.statusSignal() === 'PasswordChangeRequired');

  readonly displayName = computed(() => this.displayNameSignal() || this.menuAccess.userId());

  // ─── Sign-in ────────────────────────────────────────────────────────────────

  signInWithPassword(
    userName: string,
    password: string,
    failedAttemptCount = 0,
  ): Observable<SignInOutcome> {
    return this.identityApi
      .login({ userName, password, failedAttemptCount })
      .pipe(switchMap((response) => this.acceptLogin(response)));
  }

  signInWithSso(domainId: string, password: string): Observable<SignInOutcome> {
    return this.identityApi
      .ssoLogin({ domainId, password })
      .pipe(switchMap((response) => this.acceptLogin(response)));
  }

  ssoAvailable(): Observable<boolean> {
    return this.identityApi.ssoAvailable();
  }

  /**
   * Stores the token, then loads the session.
   *
   * `PasswordChangeRequired` deliberately still stores the token and bootstraps: the
   * change-password call itself needs to be authenticated. The gate is the routing
   * decision the caller makes on `status`, not withholding the credential.
   */
  private acceptLogin(response: LoginResponse): Observable<SignInOutcome> {
    this.storeToken(response.accessToken, response.expiresAtUtc);
    this.statusSignal.set(response.status);
    this.noticeSignal.set(response.notice);

    const outcome: SignInOutcome = {
      status: response.status,
      notice: response.notice,
      daysUntilLock:
        response.daysUntilLock === null || response.daysUntilLock === undefined
          ? null
          : int(response.daysUntilLock),
    };

    return this.bootstrap().pipe(map(() => outcome));
  }

  /**
   * Loads everything the app needs about the signed-in user.
   *
   * It takes three calls, because no single endpoint carries it: `/identity/me` has no
   * name and no roles, `/identity/menu` has the roles and the grants but no email, and
   * `/admin/account` has the profile. They are issued together rather than in sequence.
   *
   * The account call is allowed to fail — a user without the account endpoint is still a
   * valid session, they just get their login name as a display name — so a 403 there does
   * not cost them the app.
   */
  bootstrap(): Observable<void> {
    return forkJoin({
      menu: this.identityApi.menu(),
      // Non-fatal. A user who cannot read `/admin/account` still has a valid session —
      // they just get their login name as a display name. Letting a 403 here cost them
      // the whole app would be the wrong trade.
      account: this.usersApi.account().pipe(catchError(() => of(null))),
    }).pipe(
      tap(({ menu, account }) => {
        const name = account?.fullName ?? menu.userId;
        this.displayNameSignal.set(name);
        // `isAdmin` is derived from the grants inside MenuAccessService, not passed in —
        // AccountResponse carries no admin flag. See ADMINISTRATION_MENU_IDS.
        this.menuAccess.setMenu(menu);
        this.syncPermissionContext(menu.userId, name, menu.role);
        if (account?.mustChangePassword) {
          this.statusSignal.set('PasswordChangeRequired');
        }
      }),
      map(() => undefined),
    );
  }

  /**
   * Keeps PermissionService populated for the POC screens that still read it.
   *
   * `permissions` is intentionally empty: the API has no permission catalogue, and
   * inventing values here would recreate the fiction this rewrite removes. Roles are real
   * — they come from `/identity/menu` — and are mapped where they match our enum.
   */
  private syncPermissionContext(userId: string, name: string, roleNames: readonly string[]): void {
    const known = new Set<string>(this.availableRoles);
    const context: UserContext = {
      userId,
      name,
      roles: roleNames
        .map((role) => role.toUpperCase().replace(/\s+/g, '_'))
        .filter((role): role is Role => known.has(role)),
      regions: [],
      brands: [],
      permissions: [],
    };
    this.permissionService.setContext(context);
  }

  // ─── Mock path (POC role switcher) ──────────────────────────────────────────

  /**
   * Mock sign-in as a role, for POC client vetting (CLAUDE.md §3). Loads the captured menu
   * alongside, so the Administration screens and the menu fold are demoable without a
   * backend.
   */
  loginAs(role: Role): Observable<void> {
    const user = MOCK_USERS[role];
    if (!user) {
      return of(undefined);
    }
    this.activeRoleSignal.set(role);
    this.permissionService.setContext(user);
    this.displayNameSignal.set(user.name);
    this.statusSignal.set('Authenticated');
    localStorage.setItem(ROLE_STORAGE_KEY, role);

    return this.identityApi.menu().pipe(
      tap((menu) => this.menuAccess.setMenu(menu)),
      map(() => undefined),
    );
  }

  /** Restores a session at bootstrap. Call once from `provideAppInitializer`. */
  restoreSession(): Observable<void> {
    if (environment.useMocks) {
      const storedRole = localStorage.getItem(ROLE_STORAGE_KEY) as Role | null;
      return storedRole && MOCK_USERS[storedRole] ? this.loginAs(storedRole) : of(undefined);
    }

    const token = this.readStoredToken();
    if (!token) {
      return of(undefined);
    }
    this.tokenSignal.set(token);
    return this.bootstrap();
  }

  // ─── Sign-out ───────────────────────────────────────────────────────────────

  logout(): void {
    // Tell the server, but do not make the local sign-out wait on it or depend on it —
    // a failed revoke must still clear this browser.
    this.identityApi.logout().subscribe({ next: () => undefined, error: () => undefined });
    this.clearSession();
  }

  private clearSession(): void {
    this.activeRoleSignal.set(null);
    this.tokenSignal.set(null);
    this.displayNameSignal.set('');
    this.statusSignal.set(null);
    this.noticeSignal.set(null);
    this.permissionService.clearContext();
    this.menuAccess.clear();
    localStorage.removeItem(ROLE_STORAGE_KEY);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
  }

  // ─── Token ──────────────────────────────────────────────────────────────────

  /** Bearer token for the auth interceptor. */
  getToken(): string | null {
    if (environment.useMocks) {
      const role = this.activeRoleSignal();
      return role ? `mock-token.${role}` : null;
    }
    return this.tokenSignal() ?? this.readStoredToken();
  }

  currentUser(): UserContext {
    return this.permissionService.context();
  }

  private storeToken(token: string, expiresAtUtc: string): void {
    this.tokenSignal.set(token);
    // localStorage rather than sessionStorage so a refresh or a second tab keeps the
    // session, which is what an all-day internal tool needs. The trade-off is XSS
    // exposure; it is mitigated by Angular's default escaping and no `bypassSecurityTrust*`
    // anywhere in this codebase. Revisit if the app ever renders user-authored HTML.
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(TOKEN_EXPIRY_KEY, expiresAtUtc);
  }

  /** Returns the stored token, discarding it if it has already expired. */
  private readStoredToken(): string | null {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      return null;
    }
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (expiry) {
      const expiresAt = new Date(expiry).getTime();
      if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
        return null;
      }
    }
    return token;
  }
}
