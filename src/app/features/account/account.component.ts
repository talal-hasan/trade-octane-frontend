import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { AccountResponse } from '../../core/api/admin.models';
import { int } from '../../core/api/api.types';
import { MenuAccessService } from '../../core/services/menu-access.service';
import { NotificationService } from '../../core/services/notification.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../shared/icon-registry';
import { AdminUsersApi } from '../admin/services/admin-users.api';

/**
 * The signed-in user's own account — legacy's "Edit Password" (`UpdatePassword.aspx`).
 *
 * Deliberately **not** in the sidebar. It is reached from the avatar menu, because
 * changing your own password is not an administration errand and putting it under
 * Administration is what made the legacy menu fifteen items long.
 *
 * It doubles as the **forced password change** screen. `login_old` can return
 * `PasswordChangeRequired`, which is a successful credential check paired with an unusable
 * session; the login flow routes here with `?force=1`, and in that mode the page states
 * plainly that there is no way past it rather than looking like an ordinary settings page
 * the user could navigate away from.
 */
@Component({
  selector: 'to-account',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent {
  private readonly usersApi = inject(AdminUsersApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly account = signal<AccountResponse | null>(null);
  protected readonly roles = this.menuAccess.roles;

  /** Arrives as `?force=1` from the login flow; also set if the account itself says so. */
  protected readonly forced = computed(
    () =>
      this.route.snapshot.queryParamMap.get('force') === '1' ||
      this.account()?.mustChangePassword === true,
  );

  protected readonly passwordAgeDays = computed(() => {
    const value = this.account()?.passwordAgeDays;
    return value === null || value === undefined ? null : int(value);
  });

  /**
   * The API takes name and email on the same request as the password change, so they share
   * one form — separating them would mean two round-trips to change two things that the
   * contract lets you change at once.
   */
  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [matchPasswords] },
  );

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.usersApi
      .account()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (account) => {
          this.account.set(account);
          this.form.patchValue({ fullName: account.fullName, email: account.email });
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.saving.set(true);

    this.usersApi
      .changeOwnPassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        fullName: value.fullName,
        email: value.email,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.account.set(response.account);
          this.saving.set(false);
          this.form.patchValue({ currentPassword: '', newPassword: '', confirmPassword: '' });
          this.form.markAsUntouched();
          this.notifications.success('Password changed.');

          // The gate is cleared — send them where they were trying to go.
          if (!response.mustChangePassword) {
            this.router.navigateByUrl('/dashboard');
          }
        },
        error: () => this.saving.set(false),
      });
  }

  protected retry(): void {
    this.load();
  }
}

/**
 * Confirmation must match. A cross-field validator rather than an inline check, per
 * CLAUDE.md §3 — validators are pure functions, not logic embedded in a component.
 */
function matchPasswords(group: AbstractControl): ValidationErrors | null {
  const next = group.get('newPassword')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (!next || !confirm) {
    return null;
  }
  return next === confirm ? null : { passwordMismatch: true };
}
