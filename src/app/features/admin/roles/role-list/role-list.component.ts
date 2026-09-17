import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Observable } from 'rxjs';

import {
  RoleResponse,
  RoleStatusFilter,
  RoleStatusResponse,
} from '../../../../core/api/admin.models';
import { int } from '../../../../core/api/api.types';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminRolesApi } from '../../services/admin-roles.api';

/**
 * The role catalogue — legacy's "Access Control | By Role", as a list you can start from.
 *
 * Legacy dropped you straight into a role's menu tree with a picker at the top. Listing
 * the roles first costs one click and buys the thing that picker never showed: how many
 * people each role reaches. That number is the blast radius of every edit made on the
 * next screen, so it belongs in front of the decision, not after it.
 *
 * Roles are a small, stable set, so this list is filtered client-side — the endpoint
 * returns the whole catalogue in one call and has no cursor.
 */
@Component({
  selector: 'to-role-list',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './role-list.component.html',
  styleUrl: './role-list.component.scss',
})
export class RoleListComponent {
  private readonly rolesApi = inject(AdminRolesApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  // Role creation has no legacy menu row to gate on (see AdminOnlyGuard) — it is offered
  // only to admins, the same signal "Add Menu" and "Frequency Configuration" use.
  protected readonly canCreate = computed(() => this.menuAccess.isAdmin());
  // Retiring a role is a catalogue-level write with no menu row of its own either, and it
  // reaches further than anything on the access tree: it strips this role's menus from
  // every holder at once. Same gate as creation, for the same reason.
  protected readonly canToggleStatus = this.canCreate;
  protected readonly skeletonRows = Array.from({ length: 6 }, (_, index) => index);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly roles = signal<readonly RoleResponse[]>([]);
  /** The role whose activate/deactivate call is in flight — one at a time, by card. */
  protected readonly busyRoleId = signal<number | null>(null);
  /** Retiring needs confirming; restoring does not. Mirrors the user directory. */
  protected readonly pendingDeactivation = signal<RoleResponse | null>(null);
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly search = signal('');
  protected readonly status = signal<RoleStatusFilter>('All');

  protected readonly tabs: { key: RoleStatusFilter; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Inactive', label: 'Inactive' },
  ];

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const status = this.status();
    return this.roles()
      .filter((role) => {
        if (status === 'Active' && !role.isActive) {
          return false;
        }
        if (status === 'Inactive' && role.isActive) {
          return false;
        }
        if (!term) {
          return true;
        }
        return (
          role.roleName.toLowerCase().includes(term) ||
          (role.roleDescription ?? '').toLowerCase().includes(term)
        );
      })
      .slice()
      .sort((a, b) => a.roleName.localeCompare(b.roleName));
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    // 'All' rather than the endpoint default: an inactive role that still has users
    // attached is exactly the thing an admin needs to find, and the default hides it.
    this.rolesApi
      .listRoles({ status: 'All' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (roles) => {
          this.roles.set(roles);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected onSearch(): void {
    this.search.set(this.searchControl.value);
  }

  protected setStatus(status: RoleStatusFilter): void {
    this.status.set(status);
  }

  protected retry(): void {
    this.load();
  }

  protected roleId(role: RoleResponse): number {
    return int(role.roleId);
  }

  // ─── Card actions ───────────────────────────────────────────────────────────

  protected isBusy(role: RoleResponse): boolean {
    return this.busyRoleId() === this.roleId(role);
  }

  /** Restoring access is safe and reversible, so it goes straight through. */
  protected activate(role: RoleResponse): void {
    this.runStatusAction(
      role,
      this.rolesApi.activateRole(this.roleId(role)),
      (updated) => {
        const count = int(updated.assignedUserCount);
        return count === 0
          ? `${updated.roleName} activated. No one holds it yet.`
          : `${updated.roleName} activated. ${count} ${count === 1 ? 'user has' : 'users have'} its menus back.`;
      },
      `${role.roleName} was already active. Nothing changed.`,
    );
  }

  protected requestDeactivate(role: RoleResponse): void {
    this.pendingDeactivation.set(role);
  }

  protected confirmDeactivate(): void {
    const role = this.pendingDeactivation();
    this.pendingDeactivation.set(null);
    if (!role) {
      return;
    }
    this.runStatusAction(
      role,
      this.rolesApi.deactivateRole(this.roleId(role)),
      (updated) => {
        const count = int(updated.assignedUserCount);
        return count === 0
          ? `${updated.roleName} retired. No one held it, so no access changed.`
          : `${updated.roleName} retired. ${count} ${count === 1 ? 'user' : 'users'} lost the menus it granted.`;
      },
      `${role.roleName} was already retired. Nothing changed.`,
    );
  }

  /** The confirm body — the blast radius spelled out before the click, not after it. */
  protected deactivateMessage(): string {
    const role = this.pendingDeactivation();
    if (!role) {
      return '';
    }
    const count = int(role.assignedUserCount);
    const reach =
      count === 0
        ? 'No one holds it, so nobody loses access today'
        : `${count} ${count === 1 ? 'user' : 'users'} will lose the menus it grants, immediately`;
    return (
      `${role.roleName} will stop granting access. ${reach}. The role and its user ` +
      'mappings are kept, so activating it again restores what it granted.'
    );
  }

  /**
   * Applies a status write and patches that card in place from the response.
   *
   * Patching rather than reloading is deliberate: the endpoint returns the updated role
   * with a fresh `assignedUserCount`, and a reload would re-sort the grid under an admin
   * working through it. A role that no longer matches the active tab drops out of the
   * filter on its own — which is what the tab asked for, and the toast says what happened.
   */
  private runStatusAction(
    role: RoleResponse,
    action$: Observable<RoleStatusResponse>,
    changedMessage: (updated: RoleResponse) => string,
    unchangedMessage: string,
  ): void {
    const roleId = this.roleId(role);
    this.busyRoleId.set(roleId);

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.roles.update((roles) =>
          roles.map((row) => (this.roleId(row) === roleId ? response.role : row)),
        );
        this.busyRoleId.set(null);

        // `changed: false` means the server wrote nothing — the role was already in this
        // state. Reporting success there would claim a change that never happened.
        if (response.changed) {
          this.notifications.success(changedMessage(response.role));
        } else {
          this.notifications.info(unchangedMessage);
        }
      },
      // The error interceptor raises the toast; clearing the busy flag is all that is left.
      error: () => this.busyRoleId.set(null),
    });
  }
}
