import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { UserLookupResponse } from '../../../../core/api/admin.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminUsersApi } from '../../services/admin-users.api';

/**
 * Create a Trade Octane account.
 *
 * `CreateUserRequest` is five fields — `loginName`, `fullName`, `email`, `password`,
 * `domainId`. There is no user-type discriminator, no directory search endpoint and no
 * end-date field, so this is a single form rather than the three-branch wizard the POC
 * built from KT notes. The wizard's identity step has one real counterpart in the
 * contract: `GET /admin/users/lookup?email=`, the legacy **Check** button.
 *
 * That lookup is what keeps this cheap. Typing an email and pressing Check either finds an
 * existing account — in which case creating a second one is the wrong action, and the form
 * says so and offers to open the existing user instead — or returns a `suggestion` that
 * fills the rest of the form. Two fields typed, not five.
 */
@Component({
  selector: 'to-user-create',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    PageHeaderComponent,
  ],
  templateUrl: './user-create.component.html',
  styleUrl: './user-create.component.scss',
})
export class UserCreateComponent {
  private readonly usersApi = inject(AdminUsersApi);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly checking = signal(false);
  protected readonly submitting = signal(false);
  protected readonly lookup = signal<UserLookupResponse | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    loginName: ['', [Validators.required]],
    fullName: ['', [Validators.required]],
    domainId: [''],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  /** The legacy Check button. Pre-fills the form, or warns that the address is taken. */
  protected check(): void {
    const email = this.form.controls.email.value.trim();
    if (!email || this.form.controls.email.invalid || this.checking()) {
      this.form.controls.email.markAsTouched();
      return;
    }

    this.checking.set(true);
    this.usersApi
      .lookupByEmail(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.lookup.set(result);
          this.checking.set(false);

          if (result.exists) {
            // Deliberately does *not* pre-fill. The right action here is to open the
            // existing account, not to start filling a form that will be rejected.
            return;
          }

          const suggestion = result.suggestion;
          if (suggestion) {
            this.form.patchValue({
              loginName: suggestion.loginName,
              fullName: suggestion.fullName,
              domainId: suggestion.domainId ?? '',
            });
            // A suggestion that does not require a password means the account will
            // authenticate against the domain instead.
            if (!suggestion.requiresPassword) {
              this.form.controls.password.clearValidators();
              this.form.controls.password.updateValueAndValidity();
            }
          }
        },
        error: () => this.checking.set(false),
      });
  }

  protected get existingUserId(): string | null {
    const result = this.lookup();
    return result?.exists ? (result.user?.userId ?? null) : null;
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitting.set(true);

    this.usersApi
      .create({
        loginName: value.loginName.trim(),
        fullName: value.fullName.trim(),
        email: value.email.trim(),
        password: value.password,
        domainId: value.domainId.trim() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.notifications.success(
            `${value.fullName} created. They have no roles or access yet — grant them next.`,
          );
          // POST declares no response body, so we navigate on the login name we sent.
          // The detail screen re-reads the user, which is also the confirmation that the
          // account really exists.
          this.router.navigate(['/admin/users', value.loginName.trim()], {
            queryParams: { tab: 'roles' },
          });
        },
        error: () => this.submitting.set(false),
      });
  }
}
