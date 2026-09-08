import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { environment } from '../../../../environments/environment';
import { AuthService, SignInOutcome } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';

type Mode = 'password' | 'sso';

/**
 * Sign-in.
 *
 * CLAUDE.md §3 specified "branded split-panel with a Sign in with Friesland Campina
 * button. No username/password form." The contract does not support that: `login_old` is
 * a username/password credential check, and `GET /identity/login/sso` reports whether SSO
 * is configured **on this deployment** — so the SSO button cannot be assumed to exist and
 * the credential form cannot be omitted. The screen keeps the split-panel design and adds
 * what the API actually requires.
 *
 * Sign-in also has three outcomes, not two. `LoginStatus` distinguishes a clean
 * authentication from one that owes the user a screen first:
 *
 *   Authenticated           through to the app
 *   PasswordChangeRequired  hard gate — routed to the account screen, no way past it
 *   PasswordExpiryWarning   soft gate — the server's own notice, then through
 */
@Component({
  selector: 'to-login',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly useMocks = environment.useMocks;
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly mode = signal<Mode>('password');

  /** Null until the availability call answers, so the button is not flashed then withdrawn. */
  protected readonly ssoAvailable = signal<boolean | null>(null);

  /**
   * `LoginRequest.failedAttemptCount` is supplied by the *client*. We echo our own count
   * so the server can apply its lockout policy across a session. It is trivially
   * spoofable and is flagged as such in identity.models.ts — sending it is compliance
   * with the contract, not a security control we are relying on.
   */
  private failedAttempts = 0;

  protected readonly form = this.fb.nonNullable.group({
    userName: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  constructor() {
    this.authService
      .ssoAvailable()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (available) => this.ssoAvailable.set(available),
        // A deployment that cannot answer is treated as not having SSO. Showing a button
        // that leads to a 404 is worse than not showing it.
        error: () => this.ssoAvailable.set(false),
      });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    this.errorMessage.set(null);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    const { userName, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set(null);

    const request$ =
      this.mode() === 'sso'
        ? this.authService.signInWithSso(userName, password)
        : this.authService.signInWithPassword(userName, password, this.failedAttempts);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (outcome) => {
        this.failedAttempts = 0;
        this.submitting.set(false);
        this.handleOutcome(outcome);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        // The error interceptor already raised a toast; this is the inline message that
        // stays on screen next to the form the user has to correct.
        this.errorMessage.set(this.messageFor(error));
      },
    });
  }

  /**
   * Says what actually went wrong, rather than blaming the credentials for everything.
   *
   * The previous version reported "username and password did not match" for *any* failure
   * — including a 404 from a misconfigured API base, which sent us hunting for a bad
   * password when the endpoint was not there at all. Only a 400/401 is genuinely an
   * authentication failure; everything else is an infrastructure problem, and only a
   * real rejection should count toward `failedAttemptCount`.
   */
  private messageFor(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Sign-in failed. Please try again.';
    }

    switch (true) {
      case error.status === 0:
        return 'Could not reach the server. The API may be down, or the dev proxy is pointing somewhere unreachable.';
      case error.status === 400 || error.status === 401:
        this.failedAttempts += 1;
        return 'That username and password did not match. Please try again.';
      case error.status === 403:
        return 'That account is not permitted to sign in here.';
      case error.status === 404:
        return 'The sign-in endpoint was not found (404). The API base path is probably wrong — see RUN-ON-VM.md.';
      case error.status >= 500:
        return `The server errored (${error.status}) handling the sign-in. This is a backend problem, not your credentials.`;
      default:
        return `Sign-in failed (${error.status}).`;
    }
  }

  private handleOutcome(outcome: SignInOutcome): void {
    if (outcome.status === 'PasswordChangeRequired') {
      // Authenticated, but the session is unusable until the password changes — and the
      // change call itself needs the token, which is why the session is kept.
      this.router.navigate(['/account'], { queryParams: { force: 1 } });
      return;
    }

    if (outcome.status === 'PasswordExpiryWarning' && outcome.notice) {
      // The server's own wording, including the day count. Paraphrasing it would risk
      // contradicting the policy it is stating.
      this.notifications.warn(outcome.notice);
    }

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl && returnUrl !== '/login' ? returnUrl : '/dashboard');
  }
}
