import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TooltipModule } from 'primeng/tooltip';

import {
  BrandResponse,
  RegionResponse,
  RoleResponse,
  UserAccessResponse,
  UserResponse,
} from '../../../../core/api/admin.models';
import { int, intSet } from '../../../../core/api/api.types';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AccessTreeComponent } from '../../shared/access-tree/access-tree.component';
import { AdminAccessApi } from '../../services/admin-access.api';
import { AdminRolesApi } from '../../services/admin-roles.api';
import { AdminScopeApi } from '../../services/admin-scope.api';
import { AdminUsersApi } from '../../services/admin-users.api';
import {
  USER_STATUS_LABELS,
  USER_STATUS_PILL,
  initialsOf,
  userStatusOf,
} from '../user.util';

export type UserTab = 'profile' | 'roles' | 'regions' | 'brands' | 'access' | 'resignation';

/** Which slice of the role catalogue the Roles tab is showing. */
export type RoleFilter = 'all' | 'assigned' | 'available';

/**
 * Legacy "Assign Role to User". Holding this row is what authorises changing someone's
 * roles.
 *
 * **Today this is always true wherever the Roles tab renders**, because 136 is the only
 * blueprint row mapping to `tab: 'roles'` and `availableTabs` derives the tab strip from
 * exactly that mapping — so an admin who cannot assign roles never sees the tab, and the
 * read-only branch below never draws. That is deliberate: hiding matches legacy, where
 * this was its own menu item, and showing it read-only would reveal to more people than
 * the legacy system did.
 *
 * The check is kept rather than dropped because the two facts are only coincidentally
 * equal. If a second menu row is ever mapped to this tab, the guard keeps the writes
 * honest and the banner explains why the controls are inert — instead of leaving
 * checkboxes that silently do nothing.
 */
const ASSIGN_ROLE_MENU_ID = 136;

const TAB_LABELS: Record<UserTab, string> = {
  profile: 'Profile',
  roles: 'Roles',
  regions: 'Regions',
  brands: 'Brands',
  access: 'Access',
  resignation: 'Resignation',
};

/**
 * One user, every facet.
 *
 * **This screen is the menu revamp.** In the legacy system, reaching these six facets of
 * one person meant six separate menu items — Create User, Change User Details, Assign Role
 * to User, User Region Mapping, User Brand Mapping, Access Control — each with its own
 * page and its own "find the user again" step. The API is already shaped the other way
 * (`/admin/users/{id}/roles`, `/regions`, `/brands`, `/access`, `/password`), so the six
 * become six tabs over one record that is looked up once.
 *
 * **Tab visibility is the legacy grant, preserved exactly.** `MenuAccessService.tabsFor()`
 * returns only the tabs whose legacy menu row this user holds. Someone granted "User Brand
 * Mapping" and nothing else sees this screen with a single Brands tab — the same access
 * legacy enforced with a single menu item, expressed as a tab. Consolidating the
 * navigation did not widen anybody's access.
 *
 * Each tab loads on first activation, not up front: opening a user should not fire five
 * requests when the admin only wanted to check an email address.
 */
@Component({
  selector: 'to-user-detail',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
    ConfirmDialogComponent,
    AccessTreeComponent,
  ],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.scss',
})
export class UserDetailComponent {
  /** Bound from the route via `withComponentInputBinding()`. */
  readonly userId = input.required<string>();

  private readonly usersApi = inject(AdminUsersApi);
  private readonly rolesApi = inject(AdminRolesApi);
  private readonly scopeApi = inject(AdminScopeApi);
  private readonly accessApi = inject(AdminAccessApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly tabLabels = TAB_LABELS;
  protected readonly statusLabels = USER_STATUS_LABELS;
  protected readonly statusPill = USER_STATUS_PILL;
  protected readonly initialsOf = initialsOf;

  protected readonly user = signal<UserResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly headerBusy = signal(false);

  protected readonly status = computed(() => {
    const user = this.user();
    return user ? userStatusOf(user) : 'inactive';
  });

  // ─── Tabs ───────────────────────────────────────────────────────────────────

  /** Only the tabs whose legacy menu row this admin holds. */
  protected readonly availableTabs = computed<UserTab[]>(() => {
    const order: UserTab[] = ['profile', 'roles', 'regions', 'brands', 'access', 'resignation'];
    const granted = new Set(this.menuAccess.tabsFor('/admin/users'));
    return order.filter((tab) => granted.has(tab));
  });

  private readonly requestedTab = signal<UserTab | null>(null);

  protected readonly activeTab = computed<UserTab | null>(() => {
    const tabs = this.availableTabs();
    const requested = this.requestedTab();
    if (requested && tabs.includes(requested)) {
      return requested;
    }
    return tabs[0] ?? null;
  });

  constructor() {
    const deepLinked = this.route.snapshot.queryParamMap.get('tab') as UserTab | null;
    if (deepLinked) {
      this.requestedTab.set(deepLinked);
    }

    // Reloads when the route id changes — the same component instance is reused when
    // navigating between two users.
    effect(() => {
      const id = this.userId();
      if (id) {
        this.loadUser(id);
      }
    });

    // Loads a tab's data the first time it becomes active.
    effect(() => {
      const tab = this.activeTab();
      const id = this.userId();
      if (tab && id) {
        this.ensureTabLoaded(tab, id);
      }
    });
  }

  protected selectTab(tab: UserTab): void {
    this.requestedTab.set(tab);
    // Deep-linkable, so an admin can send a colleague straight to someone's access tab.
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });
  }

  private loadUser(userId: string): void {
    this.loading.set(true);
    this.failed.set(false);
    this.usersApi
      .get(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.user.set(user);
          this.profileForm.patchValue({ fullName: user.fullName, email: user.email });
          this.profileForm.markAsPristine();
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  private ensureTabLoaded(tab: UserTab, userId: string): void {
    switch (tab) {
      case 'roles':
        if (!this.rolesLoaded()) {
          this.loadRoles(userId);
        }
        break;
      case 'regions':
        if (!this.regionsLoaded()) {
          this.loadRegions(userId);
        }
        break;
      case 'brands':
        if (!this.brandsLoaded()) {
          this.loadBrands(userId);
        }
        break;
      case 'access':
        if (!this.accessLoaded()) {
          this.loadAccess(userId);
        }
        break;
      default:
        break;
    }
  }

  // ─── Profile ────────────────────────────────────────────────────────────────

  protected readonly profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly savingProfile = signal(false);

  /**
   * There is no `PUT /admin/users/{userId}`. The profile write goes through the password
   * endpoint with a null password — supported by the contract (`newPassword` is nullable
   * and `profileUpdated` is reported separately), just not obvious from the URL.
   */
  protected saveProfile(): void {
    const user = this.user();
    if (!user || this.profileForm.invalid || this.savingProfile()) {
      this.profileForm.markAllAsTouched();
      return;
    }
    const { fullName, email } = this.profileForm.getRawValue();
    this.savingProfile.set(true);
    this.usersApi
      .updateProfile(user.userId, { fullName, email })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.savingProfile.set(false);
          this.profileForm.markAsPristine();
          this.user.update((current) =>
            current
              ? { ...current, fullName: response.account.fullName, email: response.account.email }
              : current,
          );
          this.notifications.success('Profile updated.');
        },
        error: () => this.savingProfile.set(false),
      });
  }

  // ─── Passwords ──────────────────────────────────────────────────────────────

  protected readonly passwordForm = this.fb.nonNullable.group({
    newPassword: ['', [Validators.required, Validators.minLength(8)]],
  });
  protected readonly savingPassword = signal(false);
  protected readonly forceChange = signal(true);
  protected readonly confirmingReset = signal(false);

  protected toggleForceChange(): void {
    this.forceChange.update((value) => !value);
  }

  protected setPassword(): void {
    const user = this.user();
    if (!user || this.passwordForm.invalid || this.savingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    this.usersApi
      .setPassword(user.userId, {
        newPassword: this.passwordForm.getRawValue().newPassword,
        fullName: null,
        email: null,
        loginName: null,
        forceChangeAtNextSignIn: this.forceChange(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.savingPassword.set(false);
          this.passwordForm.reset();
          this.user.update((current) =>
            current
              ? { ...current, mustChangePassword: response.mustChangePassword }
              : current,
          );
          this.notifications.success(
            this.forceChange()
              ? 'Password set. They will be asked to change it at next sign-in.'
              : 'Password set.',
          );
        },
        error: () => this.savingPassword.set(false),
      });
  }

  protected confirmReset(): void {
    const user = this.user();
    this.confirmingReset.set(false);
    if (!user) {
      return;
    }
    this.savingPassword.set(true);
    this.usersApi
      .resetPassword(user.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.savingPassword.set(false);
          this.notifications.success('Password reset to the configured default.');
        },
        error: () => this.savingPassword.set(false),
      });
  }

  // ─── Roles ──────────────────────────────────────────────────────────────────

  protected readonly rolesLoaded = signal(false);
  protected readonly rolesLoading = signal(false);
  protected readonly assignedRoles = signal<readonly RoleResponse[]>([]);
  protected readonly availableRoles = signal<readonly RoleResponse[]>([]);
  /** The whole role catalogue, so an empty `available` cannot blank the tab. */
  protected readonly catalogueRoles = signal<readonly RoleResponse[]>([]);
  protected readonly roleSearch = signal('');
  protected readonly roleFilter = signal<RoleFilter>('all');
  protected readonly roleSelection = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly savingRoles = signal(false);

  /** Whether this admin may change roles, as opposed to only reading them. */
  protected readonly canManageRoles = computed(() =>
    this.menuAccess.hasMenu(ASSIGN_ROLE_MENU_ID),
  );

  /**
   * Loads the assignment **and** the full role catalogue.
   *
   * `UserRoleAssignmentResponse.available` is meant to carry the roles a user could hold,
   * but it came back empty against the live API, which left the tab showing nothing at all
   * — an admin cannot grant a role they cannot see. The catalogue is authoritative for
   * "what exists"; the assignment is authoritative for "what they hold". Reading both and
   * merging means the tab is correct whichever way the backend populates `available`.
   *
   * The catalogue call is non-fatal: if it fails we still render whatever the assignment
   * returned rather than showing an empty screen.
   */
  private loadRoles(userId: string): void {
    this.rolesLoading.set(true);
    forkJoin({
      assignment: this.rolesApi.userRoles(userId),
      catalogue: this.rolesApi.listRoles({ status: 'All' }).pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ assignment, catalogue }) => {
          this.assignedRoles.set(assignment.assigned ?? []);
          this.catalogueRoles.set(catalogue);
          this.availableRoles.set(assignment.available ?? []);
          this.roleSelection.set(
            new Set((assignment.assigned ?? []).map((role) => int(role.roleId))),
          );
          this.rolesLoading.set(false);
          this.rolesLoaded.set(true);
        },
        error: () => {
          this.rolesLoading.set(false);
          this.rolesLoaded.set(true);
        },
      });
  }

  /**
   * One list showing every role with its state. Assigned entries win on a collision so a
   * role the user holds is never hidden because the catalogue omitted it.
   */
  protected readonly allRoles = computed<readonly RoleResponse[]>(() => {
    const byId = new Map<number, RoleResponse>();
    for (const role of [...this.catalogueRoles(), ...this.availableRoles()]) {
      byId.set(int(role.roleId), role);
    }
    for (const role of this.assignedRoles()) {
      byId.set(int(role.roleId), role);
    }
    return [...byId.values()].sort((a, b) => a.roleName.localeCompare(b.roleName));
  });

  /**
   * The roles currently ticked, as full records rather than ids — this is what the
   * "Assigned" strip renders, so it stays in step with the checkboxes while the admin is
   * still deciding, rather than lagging behind until Save.
   */
  protected readonly selectedRoles = computed<readonly RoleResponse[]>(() => {
    const selection = this.roleSelection();
    return this.allRoles().filter((role) => selection.has(int(role.roleId)));
  });

  /** Roles matching both the Show filter and the search box. */
  protected readonly visibleRoles = computed<readonly RoleResponse[]>(() => {
    const term = this.roleSearch().trim().toLowerCase();
    const filter = this.roleFilter();
    const selection = this.roleSelection();

    return this.allRoles().filter((role) => {
      if (filter === 'assigned' && !selection.has(int(role.roleId))) {
        return false;
      }
      if (filter === 'available' && selection.has(int(role.roleId))) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        role.roleName.toLowerCase().includes(term) ||
        (role.roleDescription ?? '').toLowerCase().includes(term)
      );
    });
  });

  /** How many roles each Show tab would reveal, so the counts are visible before clicking. */
  protected readonly availableCount = computed(
    () => this.allRoles().length - this.roleSelection().size,
  );

  protected onRoleSearch(value: string): void {
    this.roleSearch.set(value);
  }

  protected setRoleFilter(filter: RoleFilter): void {
    this.roleFilter.set(filter);
  }

  protected readonly rolesDirty = computed(() => {
    const original = new Set(this.assignedRoles().map((role) => int(role.roleId)));
    const current = this.roleSelection();
    if (original.size !== current.size) {
      return true;
    }
    for (const id of current) {
      if (!original.has(id)) {
        return true;
      }
    }
    return false;
  });

  protected toggleRole(roleId: number): void {
    if (!this.canManageRoles()) {
      return;
    }
    this.roleSelection.update((current) => {
      const next = new Set(current);
      if (!next.delete(roleId)) {
        next.add(roleId);
      }
      return next;
    });
  }

  /** Puts the selection back to what the server holds, abandoning unsaved ticks. */
  protected discardRoleChanges(): void {
    this.roleSelection.set(new Set(this.assignedRoles().map((role) => int(role.roleId))));
  }

  protected saveRoles(): void {
    const user = this.user();
    if (!user || this.savingRoles() || !this.canManageRoles()) {
      return;
    }
    this.savingRoles.set(true);
    // Composed from DELETE + POST because UserRoleWriteRequest carries a scalar roleId —
    // see AdminRolesApi.replaceUserRoles for the contract note.
    this.rolesApi
      .replaceUserRoles(user.userId, [...this.roleSelection()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (assignment) => {
          this.assignedRoles.set(assignment.assigned);
          this.availableRoles.set(assignment.available);
          this.roleSelection.set(new Set(assignment.assigned.map((role) => int(role.roleId))));
          this.savingRoles.set(false);
          // Roles supply menu grants, so the access tab is now stale.
          this.accessLoaded.set(false);
          this.notifications.success('Roles updated.');
        },
        error: () => this.savingRoles.set(false),
      });
  }

  // ─── Regions & brands ───────────────────────────────────────────────────────

  protected readonly regionsLoaded = signal(false);
  protected readonly regionsLoading = signal(false);
  protected readonly allRegions = signal<readonly RegionResponse[]>([]);
  protected readonly regionSelection = signal<ReadonlySet<string>>(new Set<string>());
  private readonly originalRegions = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly savingRegions = signal(false);

  protected readonly brandsLoaded = signal(false);
  protected readonly brandsLoading = signal(false);
  protected readonly allBrands = signal<readonly BrandResponse[]>([]);
  protected readonly brandSelection = signal<ReadonlySet<string>>(new Set<string>());
  private readonly originalBrands = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly savingBrands = signal(false);

  private loadRegions(userId: string): void {
    this.regionsLoading.set(true);
    this.scopeApi
      .userRegions(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (assignment) => {
          const assignedCodes = new Set(assignment.assigned.map((region) => region.code));
          this.allRegions.set(this.mergeByCode(assignment.assigned, assignment.available));
          this.regionSelection.set(assignedCodes);
          this.originalRegions.set(new Set(assignedCodes));
          this.regionsLoading.set(false);
          this.regionsLoaded.set(true);
        },
        error: () => this.regionsLoading.set(false),
      });
  }

  private loadBrands(userId: string): void {
    this.brandsLoading.set(true);
    this.scopeApi
      .userBrands(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (assignment) => {
          const assignedCodes = new Set(assignment.assigned.map((brand) => brand.code));
          this.allBrands.set(this.mergeByCode(assignment.assigned, assignment.available));
          this.brandSelection.set(assignedCodes);
          this.originalBrands.set(new Set(assignedCodes));
          this.brandsLoading.set(false);
          this.brandsLoaded.set(true);
        },
        error: () => this.brandsLoading.set(false),
      });
  }

  /**
   * Merges assigned and available into one catalogue.
   *
   * Assigned wins on a collision, and assigned entries that are *not* in available are
   * kept: a retired region a user still holds must stay visible, or the admin cannot see
   * — let alone remove — the mapping that exists.
   */
  private mergeByCode<T extends { code: string; name: string }>(
    assigned: readonly T[],
    available: readonly T[],
  ): T[] {
    const byCode = new Map<string, T>();
    for (const entry of available) {
      byCode.set(entry.code, entry);
    }
    for (const entry of assigned) {
      byCode.set(entry.code, entry);
    }
    return [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ─── Chip filtering & bulk selection ───────────────────────────────────────
  // A user can hold 16 regions and 22 brands. Hunting for one in an unordered wall of
  // chips is the slow part of the job, and "give this person everything" was previously
  // 22 individual clicks.
  protected readonly regionSearch = signal('');
  protected readonly brandSearch = signal('');

  protected readonly visibleRegions = computed(() =>
    filterByName(this.allRegions(), this.regionSearch()),
  );
  protected readonly visibleBrands = computed(() =>
    filterByName(this.allBrands(), this.brandSearch()),
  );

  protected onRegionSearch(value: string): void {
    this.regionSearch.set(value);
  }

  protected onBrandSearch(value: string): void {
    this.brandSearch.set(value);
  }

  /**
   * Select-all acts on what is **visible**, not on the whole catalogue.
   *
   * That is the only safe reading when a filter is active: a button labelled "Select all"
   * sitting above six filtered chips must not silently grant the other sixteen.
   */
  protected readonly allVisibleRegionsSelected = computed(() => {
    const visible = this.visibleRegions();
    const selected = this.regionSelection();
    return visible.length > 0 && visible.every((region) => selected.has(region.code));
  });

  protected readonly allVisibleBrandsSelected = computed(() => {
    const visible = this.visibleBrands();
    const selected = this.brandSelection();
    return visible.length > 0 && visible.every((brand) => selected.has(brand.code));
  });

  protected toggleAllRegions(): void {
    const visible = this.visibleRegions().map((region) => region.code);
    const selectAll = !this.allVisibleRegionsSelected();
    this.regionSelection.update((current) => applyBulk(current, visible, selectAll));
  }

  protected toggleAllBrands(): void {
    const visible = this.visibleBrands().map((brand) => brand.code);
    const selectAll = !this.allVisibleBrandsSelected();
    this.brandSelection.update((current) => applyBulk(current, visible, selectAll));
  }

  protected toggleRegion(code: string): void {
    this.regionSelection.update((current) => this.toggleCode(current, code));
  }

  protected toggleBrand(code: string): void {
    this.brandSelection.update((current) => this.toggleCode(current, code));
  }

  private toggleCode(current: ReadonlySet<string>, code: string): ReadonlySet<string> {
    const next = new Set(current);
    if (!next.delete(code)) {
      next.add(code);
    }
    return next;
  }

  protected readonly regionsDirty = computed(() =>
    this.setsDiffer(this.originalRegions(), this.regionSelection()),
  );
  protected readonly brandsDirty = computed(() =>
    this.setsDiffer(this.originalBrands(), this.brandSelection()),
  );

  private setsDiffer(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) {
      return true;
    }
    for (const value of b) {
      if (!a.has(value)) {
        return true;
      }
    }
    return false;
  }

  protected saveRegions(): void {
    const user = this.user();
    if (!user || this.savingRegions()) {
      return;
    }
    this.savingRegions.set(true);
    // Codes go back exactly as reported — they come from another database with no foreign
    // key protecting the mapping. See AdminScopeApi.
    this.scopeApi
      .replaceUserRegions(user.userId, [...this.regionSelection()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const codes = new Set(response.assignment.assigned.map((region) => region.code));
          this.regionSelection.set(codes);
          this.originalRegions.set(new Set(codes));
          this.savingRegions.set(false);
          this.notifications.success('Regions updated.');
        },
        error: () => this.savingRegions.set(false),
      });
  }

  protected saveBrands(): void {
    const user = this.user();
    if (!user || this.savingBrands()) {
      return;
    }
    this.savingBrands.set(true);
    this.scopeApi
      .replaceUserBrands(user.userId, [...this.brandSelection()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const codes = new Set(response.assignment.assigned.map((brand) => brand.code));
          this.brandSelection.set(codes);
          this.originalBrands.set(new Set(codes));
          this.savingBrands.set(false);
          this.notifications.success('Brands updated.');
        },
        error: () => this.savingBrands.set(false),
      });
  }

  // ─── Access ─────────────────────────────────────────────────────────────────

  protected readonly accessLoaded = signal(false);
  protected readonly accessLoading = signal(false);
  protected readonly access = signal<UserAccessResponse | null>(null);
  protected readonly directSelection = signal<ReadonlySet<number>>(new Set<number>());
  private readonly originalDirect = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly savingAccess = signal(false);
  protected readonly accessFilterControl = this.fb.nonNullable.control('');
  protected readonly accessFilter = signal('');

  private loadAccess(userId: string): void {
    this.accessLoading.set(true);
    this.accessApi
      .userAccess(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.access.set(response);
          // Bound to *direct* grants — the only set this endpoint's writes control.
          const direct = intSet(response.directMenuIds);
          this.directSelection.set(direct);
          this.originalDirect.set(new Set(direct));
          this.accessLoading.set(false);
          this.accessLoaded.set(true);
        },
        error: () => this.accessLoading.set(false),
      });
  }

  /** Role-supplied grants. Shown as locked in the tree — PUT here cannot remove them. */
  protected readonly roleMenuIds = computed(() => intSet(this.access()?.roleMenuIds ?? []));

  protected readonly accessDirty = computed(() => {
    const original = this.originalDirect();
    const current = this.directSelection();
    if (original.size !== current.size) {
      return true;
    }
    for (const id of current) {
      if (!original.has(id)) {
        return true;
      }
    }
    return false;
  });

  protected onAccessToggled(event: { menuId: number; checked: boolean }): void {
    this.directSelection.update((current) => {
      const next = new Set(current);
      if (event.checked) {
        next.add(event.menuId);
      } else {
        next.delete(event.menuId);
      }
      return next;
    });
  }

  protected onAccessFilter(value: string): void {
    this.accessFilter.set(value);
  }

  protected saveAccess(): void {
    const user = this.user();
    if (!user || this.savingAccess()) {
      return;
    }
    this.savingAccess.set(true);
    this.accessApi
      .replaceUserAccess(user.userId, [...this.directSelection()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.access.set(response.access);
          const direct = intSet(response.access.directMenuIds);
          this.directSelection.set(direct);
          this.originalDirect.set(new Set(direct));
          this.savingAccess.set(false);

          // `noLongerEffective` is the interesting case: grants removed from the direct
          // set that a role still supplies, so nothing actually changed for the user.
          // Saying "saved" without saying that would be misleading.
          const stillReachable = response.noLongerEffective?.length ?? 0;
          this.notifications.success(
            stillReachable > 0
              ? `Access updated. ${stillReachable} item(s) are still reachable through a role.`
              : 'Access updated.',
          );
        },
        error: () => this.savingAccess.set(false),
      });
  }

  // ─── Header actions ─────────────────────────────────────────────────────────

  protected readonly confirmingDeactivate = signal(false);

  protected activate(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.headerBusy.set(true);
    this.usersApi
      .activate(user.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.user.set(updated);
          this.headerBusy.set(false);
          this.notifications.success('Account activated.');
        },
        error: () => this.headerBusy.set(false),
      });
  }

  protected confirmDeactivate(): void {
    const user = this.user();
    this.confirmingDeactivate.set(false);
    if (!user) {
      return;
    }
    this.headerBusy.set(true);
    this.usersApi
      .deactivate(user.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.user.set(updated);
          this.headerBusy.set(false);
          this.notifications.success('Account deactivated and cached grants dropped.');
        },
        error: () => this.headerBusy.set(false),
      });
  }

  protected unlock(): void {
    const user = this.user();
    if (!user) {
      return;
    }
    this.headerBusy.set(true);
    this.usersApi
      .unlock(user.userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.user.set(updated);
          this.headerBusy.set(false);
          this.notifications.success('Lock cleared. The password is unchanged.');
        },
        error: () => this.headerBusy.set(false),
      });
  }

  protected retry(): void {
    this.loadUser(this.userId());
  }
}

/** Case-insensitive match on name, short name or code. */
function filterByName<T extends { code: string; name: string; shortName: string }>(
  entries: readonly T[],
  term: string,
): readonly T[] {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return entries;
  }
  return entries.filter(
    (entry) =>
      entry.name.toLowerCase().includes(needle) ||
      (entry.shortName ?? '').toLowerCase().includes(needle) ||
      entry.code.toLowerCase().includes(needle),
  );
}

/** Adds or removes a set of codes without disturbing anything outside that set. */
function applyBulk(
  current: ReadonlySet<string>,
  codes: readonly string[],
  select: boolean,
): ReadonlySet<string> {
  const next = new Set(current);
  for (const code of codes) {
    if (select) {
      next.add(code);
    } else {
      next.delete(code);
    }
  }
  return next;
}
