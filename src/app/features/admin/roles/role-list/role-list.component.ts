import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { RoleResponse, RoleStatusFilter } from '../../../../core/api/admin.models';
import { int } from '../../../../core/api/api.types';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
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
  ],
  templateUrl: './role-list.component.html',
  styleUrl: './role-list.component.scss',
})
export class RoleListComponent {
  private readonly rolesApi = inject(AdminRolesApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  // Role creation has no legacy menu row to gate on (see AdminOnlyGuard) — it is offered
  // only to admins, the same signal "Add Menu" and "Frequency Configuration" use.
  protected readonly canCreate = computed(() => this.menuAccess.isAdmin());
  protected readonly skeletonRows = Array.from({ length: 6 }, (_, index) => index);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly roles = signal<readonly RoleResponse[]>([]);
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
}
