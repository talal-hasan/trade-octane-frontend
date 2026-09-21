import { ApiInt } from './api.types';

// ─── Identity contracts (tag: Identity) ───────────────────────────────────────

export type LegacyUserType = 'Unknown' | 'EflEmployee' | 'Distributor';

/**
 * Login does not simply succeed or fail — it succeeds into one of three states, and two
 * of them owe the user a screen before they reach the app.
 *
 *   Authenticated          straight through
 *   PasswordChangeRequired hard gate: the forced-change screen, no route out
 *   PasswordExpiryWarning  soft gate: a dismissible notice, `daysUntilLock` days left
 */
export type LoginStatus = 'Authenticated' | 'PasswordChangeRequired' | 'PasswordExpiryWarning';

export interface LoginRequest {
  userName: string;
  password: string;
  /**
   * [QUESTION for Zeeshan] The contract takes the failed-attempt counter *from the client*.
   * We send back what the previous 401 reported so the server can apply its lockout policy.
   * Client-supplied and therefore trivially spoofable — flagged, not designed around.
   */
  failedAttemptCount?: number;
}

export interface LoginResponse {
  userId: string;
  userType: LegacyUserType;
  status: LoginStatus;
  accessToken: string;
  tokenType: string;
  expiresAtUtc: string;
  passwordChangeRequired: boolean;
  notice: string | null;
  daysUntilLock: ApiInt | null;
}

export interface SsoLoginRequest {
  /** The FCEPL domain account, not the Trade Octane login name. */
  domainId: string;
  password: string;
}

export interface SsoAvailabilityResponse {
  enabled: boolean;
}

export interface LogoutResponse {
  revokedAtUtc: string;
  tokenExpiresAtUtc: string;
}

/**
 * Deliberately thin — userId, userType and a logged-in flag, nothing else. There is no
 * name, email or role on this response, so UserContext is composed from three calls:
 * `/identity/me` (identity) + `/identity/menu` (roles + menu tree) + `/admin/account`
 * (full name, email). See AuthService.
 */
export interface CurrentUserResponse {
  userId: string;
  userType: string;
  loggedInFlag: string;
}

export interface CurrentUserWrapperResponse {
  data: CurrentUserResponse;
}

// ─── The menu ─────────────────────────────────────────────────────────────────

/**
 * One node of the granted menu tree. `catalog` carries the legacy page identifier
 * (`CreateUser.aspx`, `Access_Rights.aspx`, …) and is the **only** join key between a
 * granted menu row and an Angular route — everything in menu-blueprint.ts keys on it.
 */
export interface MenuItemResponse {
  menuId: ApiInt;
  name: string;
  icon: string | null;
  catalog: string;
  children: MenuItemResponse[];
  hasChildren?: boolean;
}

export interface UserMenuResponse {
  userId: string;
  /** Role *names*, not ids. The only place the signed-in user's roles are reported. */
  role: string[];
  menu: MenuItemResponse[];
  /**
   * **Region and brand *names*** — "Central Punjab", "Olper's" — the scope this user's data
   * is limited to. Added 2026-09-20; before that the dashboard reported everyone's scope as
   * empty, because nothing on the sign-in path carried it.
   *
   * This is the only call that reports it. `GET /admin/users/{id}/regions` reads the same
   * mappings but sits behind the user-admin policy, so a non-admin asking for their own
   * scope got a 403 — which is why it is here and not fetched separately.
   *
   * Optional on the wire: a deployment running an older API omits them, and empty is also a
   * legitimate answer (177 of 547 accounts are mapped to no region). Those two cases are
   * indistinguishable here, so nothing may treat empty as "not loaded yet".
   */
  regions?: string[];
  brands?: string[];
}
