import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { NotificationService } from '../../../../core/services/notification.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { AdminRolesApi } from '../../services/admin-roles.api';

/**
 * Create a role — `POST /admin/roles`.
 *
 * Has no legacy counterpart: nothing in the Web Forms application could create a role, so
 * the 43 existing rows were inserted by hand, straight into the table. That is also why
 * this route is gated on `AdminOnlyGuard` rather than a menu grant (see that guard) —
 * "Access Control | By Role" gets you the role catalogue and each role's access tree, not
 * the power to mint new ones.
 *
 * `roleName` is required and unique, case-insensitively; `roleDesc` is optional; `status`
 * defaults to active, and is exposed here as an explicit toggle because sending it false
 * (a retired role, created on purpose) is a real, if rare, use case. The response reports
 * `baselineGrants` — the seed access the new role was given so it is not entirely inert —
 * which is surfaced after creation rather than promised up front, since a grant can be
 * skipped if its target menu was not found by name.
 */
@Component({
  selector: 'to-role-create',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    PageHeaderComponent,
  ],
  templateUrl: './role-create.component.html',
  styleUrl: './role-create.component.scss',
})
export class RoleCreateComponent {
  private readonly rolesApi = inject(AdminRolesApi);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly submitting = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    roleName: ['', [Validators.required, Validators.maxLength(100)]],
    roleDesc: ['', [Validators.maxLength(255)]],
    active: [true],
  });

  protected setActive(active: boolean): void {
    this.form.controls.active.setValue(active);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.submitting.set(true);

    this.rolesApi
      .createRole({
        roleName: value.roleName.trim(),
        roleDesc: value.roleDesc.trim() || null,
        status: value.active,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.notifications.success(`${response.role.roleName} created.`);
          // Land on the new role's access tree — the seed grants it was created with are a
          // starting point, not the finished access the role needs.
          this.router.navigate(['/admin/roles', response.role.roleId]);
        },
        error: () => this.submitting.set(false),
      });
  }
}
