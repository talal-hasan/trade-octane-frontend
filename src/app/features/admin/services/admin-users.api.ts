import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import {
  AccountResponse,
  ChangePasswordRequest,
  CreateUserRequest,
  PasswordChangeResponse,
  ResetPasswordRequest,
  SetUserPasswordRequest,
  UserLookupResponse,
  UserLookupWrapperResponse,
  UserPageResponse,
  UserResponse,
  UserSortField,
  UserStatusFilter,
  UserWrapperResponse,
} from '../../../core/api/admin.models';

export interface UserListQuery {
  search?: string;
  status?: UserStatusFilter;
  sort?: UserSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

/**
 * `Administration 1.0 / Create User` + `/ Update Password`.
 *
 * Note there is no `PUT /admin/users/{userId}`. Editing a user's name or email goes
 * through `setPassword` with a null password — see `updateProfile`, which exists to make
 * that legible at the call site rather than having screens post password requests to
 * rename someone.
 */
@Injectable({ providedIn: 'root' })
export class AdminUsersApi {
  private readonly api = inject(ApiClient);

  list(query: UserListQuery = {}): Observable<UserPageResponse> {
    return this.api.get<UserPageResponse>('/admin/users', query as Query);
  }

  /** The filtered directory as CSV. Pass the *same* query the grid is showing. */
  exportCsv(query: Omit<UserListQuery, 'pageSize' | 'cursor'> = {}): Observable<Blob> {
    return this.api.downloadCsv('/admin/users/export', query as Query);
  }

  get(userId: string): Observable<UserResponse> {
    return this.api
      .get<UserWrapperResponse>(`/admin/users/${encodeURIComponent(userId)}`)
      .pipe(map((response) => response.data));
  }

  /** The "Check" button: is this address taken, and what should the form pre-fill with? */
  lookupByEmail(email: string): Observable<UserLookupResponse> {
    return this.api
      .get<UserLookupWrapperResponse>('/admin/users/lookup', { email })
      .pipe(map((response) => response.data));
  }

  /**
   * `POST /admin/users` declares no response body in the contract.
   * [QUESTION for Zeeshan] What comes back? We need at least the login name to navigate to
   * the new user. Until then the caller re-reads the user with `get(loginName)`.
   */
  create(request: CreateUserRequest): Observable<void> {
    return this.api.post<void>('/admin/users', request);
  }

  activate(userId: string): Observable<UserResponse> {
    return this.api.post<UserResponse>(`/admin/users/${encodeURIComponent(userId)}/activate`);
  }

  deactivate(userId: string): Observable<UserResponse> {
    return this.api.post<UserResponse>(`/admin/users/${encodeURIComponent(userId)}/deactivate`);
  }

  /** Clears the lock set by failed sign-in attempts. Does not change the password. */
  unlock(userId: string): Observable<UserResponse> {
    return this.api.post<UserResponse>(`/admin/users/${encodeURIComponent(userId)}/unlock`);
  }

  // ─── Passwords & profile ────────────────────────────────────────────────────

  /** Sets another user's password, and optionally their name, email and login name. */
  setPassword(
    userId: string,
    request: SetUserPasswordRequest,
  ): Observable<PasswordChangeResponse> {
    return this.api.put<PasswordChangeResponse>(
      `/admin/users/${encodeURIComponent(userId)}/password`,
      request,
    );
  }

  /**
   * Renames a user / corrects their email **without** touching credentials.
   *
   * `SetUserPasswordRequest.newPassword` is nullable and the response reports
   * `profileUpdated` separately, so this is a supported use of that endpoint rather than a
   * trick — but it is not obvious from the URL, hence this wrapper.
   */
  updateProfile(
    userId: string,
    profile: { fullName: string; email: string; loginName?: string | null },
  ): Observable<PasswordChangeResponse> {
    return this.setPassword(userId, {
      newPassword: null,
      fullName: profile.fullName,
      email: profile.email,
      loginName: profile.loginName ?? null,
      forceChangeAtNextSignIn: null,
    });
  }

  /** Resets to the configured default password. Body is optional. */
  resetPassword(userId: string, request?: ResetPasswordRequest): Observable<PasswordChangeResponse> {
    return this.api.post<PasswordChangeResponse>(
      `/admin/users/${encodeURIComponent(userId)}/password/reset`,
      request ?? null,
    );
  }

  // ─── The signed-in user's own account ───────────────────────────────────────

  account(): Observable<AccountResponse> {
    return this.api.get<AccountResponse>('/admin/account');
  }

  changeOwnPassword(request: ChangePasswordRequest): Observable<PasswordChangeResponse> {
    return this.api.put<PasswordChangeResponse>('/admin/account/password', request);
  }
}
