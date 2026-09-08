import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';

import { ApiClient } from './api-client.service';
import {
  CurrentUserResponse,
  CurrentUserWrapperResponse,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  SsoAvailabilityResponse,
  SsoLoginRequest,
  UserMenuResponse,
} from './identity.models';

/**
 * Identity transport. Abstract class doubles as the DI token so the mock swaps in with a
 * one-line provider change and no component edits (CLAUDE.md §3 mock-first).
 */
export abstract class IdentityApi {
  abstract login(request: LoginRequest): Observable<LoginResponse>;
  abstract ssoAvailable(): Observable<boolean>;
  abstract ssoLogin(request: SsoLoginRequest): Observable<LoginResponse>;
  abstract me(): Observable<CurrentUserResponse>;
  abstract menu(): Observable<UserMenuResponse>;
  abstract logout(): Observable<LogoutResponse>;
}

@Injectable()
export class HttpIdentityApi extends IdentityApi {
  private readonly api = inject(ApiClient);

  login(request: LoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/identity/login_old', request);
  }

  /**
   * Whether SSO is configured **on this deployment** — so the login screen must ask before
   * it can decide whether to render the SSO button. It is not a build-time constant.
   */
  ssoAvailable(): Observable<boolean> {
    return this.api
      .get<SsoAvailabilityResponse>('/identity/login/sso')
      .pipe(map((response) => response.enabled));
  }

  ssoLogin(request: SsoLoginRequest): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('/identity/login/sso', request);
  }

  me(): Observable<CurrentUserResponse> {
    return this.api
      .get<CurrentUserWrapperResponse>('/identity/me')
      .pipe(map((response) => response.data));
  }

  menu(): Observable<UserMenuResponse> {
    // The menu endpoint is documented as returning UserMenuResponse, but the captured
    // response wraps it in `data` like /identity/me does. Accept either rather than break
    // on whichever shape the deployment actually serves.
    return this.api
      .get<UserMenuResponse | { data: UserMenuResponse }>('/identity/menu')
      .pipe(map((response) => ('data' in response ? response.data : response)));
  }

  logout(): Observable<LogoutResponse> {
    return this.api.post<LogoutResponse>('/identity/logout');
  }
}

/**
 * Mock identity, backed by a **real captured `/identity/menu` response** — the Admin menu
 * for t_SufyaM01, 95 rows across 20 modules (`public/assets/response_menu.json`).
 *
 * Using the real payload rather than a hand-written fixture is deliberate: it means the
 * menu fold, the nav, the route gate and every tab visibility rule are exercised against
 * production-shaped data during POC demos, so a mapping gap shows up on Talal's screen
 * rather than on the first day against a live backend.
 */
@Injectable()
export class MockIdentityApi extends IdentityApi {
  private readonly http = inject(HttpClient);

  private static readonly LATENCY_MS = 220;

  login(request: LoginRequest): Observable<LoginResponse> {
    return of<LoginResponse>({
      userId: request.userName,
      userType: 'EflEmployee',
      status: 'Authenticated',
      accessToken: `mock-token.${request.userName}`,
      tokenType: 'Bearer',
      expiresAtUtc: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      passwordChangeRequired: false,
      notice: null,
      daysUntilLock: null,
    }).pipe(delay(MockIdentityApi.LATENCY_MS));
  }

  ssoAvailable(): Observable<boolean> {
    return of(true).pipe(delay(80));
  }

  ssoLogin(request: SsoLoginRequest): Observable<LoginResponse> {
    return this.login({ userName: request.domainId, password: request.password });
  }

  me(): Observable<CurrentUserResponse> {
    return this.menu().pipe(
      map((menu) => ({ userId: menu.userId, userType: 'EflEmployee', loggedInFlag: 'Y' })),
    );
  }

  menu(): Observable<UserMenuResponse> {
    return this.http
      .get<{ data: UserMenuResponse }>('assets/response_menu.json')
      .pipe(map((response) => response.data));
  }

  logout(): Observable<LogoutResponse> {
    return of<LogoutResponse>({
      revokedAtUtc: new Date().toISOString(),
      tokenExpiresAtUtc: new Date().toISOString(),
    });
  }
}
