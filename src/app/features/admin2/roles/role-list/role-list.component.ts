import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged, map } from 'rxjs';

import { Octane2RoleResponse, Octane2RoleWriteResponse } from '../../../../core/api/admin2.models';
import { int } from '../../../../core/api/api.types';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { Admin2RolesApi } from '../../services/admin2-roles.api';
import { Octane2RolesStore } from '../../services/octane2-roles.store';
import { ROLE_FLAGS, ROLES_2_ROUTE, ROLES_2_TAB_ACCESS, ROLES_2_TAB_DETAILS, plural, roleLabel } from '../role.util';

type StatusTab = 'Active' | 'Inactive' | 'All';
type SortKey = 'roleId' | 'roleName' | 'menus' | 'users';

/** A row with what the grid needs worked out once. */
interface RoleRow {
  role: Octane2RoleResponse;
  roleId: number;
  users: number;
  activeUsers: number;
  /** Menu items granted — the screens (and their parent headings) holders open. */
  menus: number;
  /** "2 approval steps · 1 authority level", or empty. */
  reach: string;
  inUse: boolean;
  haystack: string;
}

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function toRow(role: Octane2RoleResponse): RoleRow {
  const menus = int(role.menuGrantCount);
  const steps = int(role.approvalHierarchyLevelCount);
  const levels = int(role.authorityLevelCount);
  const users = int(role.userCount);
  const reach = [
    steps > 0 ? plural(steps, 'approval step') : '',
    levels > 0 ? plural(levels, 'authority level') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    role,
    roleId: int(role.roleId),
    users,
    activeUsers: int(role.activeUserCount),
    menus,
    reach,
    inUse: users + steps + levels > 0,
    haystack: `${role.roleName}${role.roleDescription}`.toLowerCase(),
  };
}

/**
 * Roles — the grid half of legacy's Create Role (Administration 2.0).
 *
 * A table rather than the 1.0 screen's cards: what an admin reads here is the four claim
 * flags **across** roles — which roles may enter a WBS / spend proposal — and a column per
 * flag is the only layout that lets that be compared down the page.
 *
 * Each role also says where it is used — accounts, approval steps, authority levels — and how
 * many menu items it grants, linking to the role's menu access (legacy "Access Control | By
 * Role", menuId 154). The 33 roles load once; tabs, search and sort run in memory.
 *
 * The screen folds two legacy rows, as tabs of one destination: Create Role (88) gives the
 * details actions, Access Control | By Role (154) the menu access. Each shows only to holders.
 */
@Component({
  selector: 'to-admin2-role-list',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './role-list.component.html',
  styleUrl: './role-list.component.scss',
})
export class Admin2RoleListComponent {
  /** `?saved=<roleId>` — set by the form after a save, so the row can be found and marked. */
  readonly saved = input<string | undefined>(undefined);

  private readonly api = inject(Admin2RolesApi);
  private readonly store = inject(Octane2RolesStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly menuAccess = inject(MenuAccessService);

  protected readonly icons = ICON_REGISTRY;
  protected readonly canEditDetails = computed(() => this.menuAccess.tabsFor(ROLES_2_ROUTE).includes(ROLES_2_TAB_DETAILS));
  protected readonly canEditAccess = computed(() => this.menuAccess.tabsFor(ROLES_2_ROUTE).includes(ROLES_2_TAB_ACCESS));
  protected readonly flags = ROLE_FLAGS;
  protected readonly route = ROLES_2_ROUTE;
  protected readonly plural = plural;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, index) => index);

  protected readonly loaded = this.store.loaded;
  protected readonly refreshing = this.store.refreshing;
  protected readonly loading = computed(() => !this.store.loaded() && !this.store.failed());
  protected readonly failed = computed(() => !this.store.loaded() && this.store.failed());

  protected readonly busyId = signal<number | null>(null);
  protected readonly pendingDeactivation = signal<RoleRow | null>(null);
  protected readonly highlightId = signal<number | null>(null);

  /** Active first — it is what every role picker offers, and the API's own default. */
  protected readonly status = signal<StatusTab>('Active');
  protected readonly sortKey = signal<SortKey>('roleId');
  protected readonly desc = signal(false);

  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(100),
      map((value) => value.trim().toLowerCase()),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ),
    { initialValue: '' },
  );

  private readonly rows = computed(() => this.store.rows().map(toRow));

  protected readonly tabs: { key: StatusTab; label: string; hint: string }[] = [
    { key: 'Active', label: 'Active', hint: 'Offered for new user mappings, approval steps and authority levels' },
    { key: 'Inactive', label: 'Inactive', hint: 'Refused for new uses; existing ones are untouched' },
    { key: 'All', label: 'All', hint: 'Every role' },
  ];

  protected readonly counts = computed(() => {
    const all = this.rows().length;
    const active = this.rows().filter((row) => row.role.isActive).length;
    return { Active: active, Inactive: all - active, All: all } satisfies Record<StatusTab, number>;
  });

  protected readonly filtered = computed(() => {
    const status = this.status();
    const term = this.search();
    const key = this.sortKey();
    const direction = this.desc() ? -1 : 1;

    return this.rows()
      .filter((row) => {
        if (status === 'Active' && !row.role.isActive) {
          return false;
        }
        if (status === 'Inactive' && row.role.isActive) {
          return false;
        }
        return !term || row.haystack.includes(term);
      })
      .sort((a, b) => {
        switch (key) {
          case 'roleName':
            return direction * (COLLATOR.compare(a.role.roleName, b.role.roleName) || a.roleId - b.roleId);
          case 'menus':
            return direction * (a.menus - b.menus || a.roleId - b.roleId);
          case 'users':
            return direction * (a.users - b.users || a.roleId - b.roleId);
          default:
            return direction * (a.roleId - b.roleId);
        }
      });
  });

  constructor() {
    // Shows what the store already holds at once, and re-fetches only once it is stale.
    this.store.ensureFresh();

    // After a save, bring the saved role into view once: widen the tab if it is filtered out.
    let settled = false;
    effect(() => {
      const id = Number(this.saved());
      if (settled || !Number.isFinite(id) || id <= 0 || !this.store.loaded()) {
        return;
      }
      settled = true;
      if (!this.store.byKey(id)) {
        return;
      }
      if (!this.filtered().some((row) => row.roleId === id)) {
        this.status.set('All');
      }
      this.highlightId.set(id);
    });
  }

  protected setStatus(status: StatusTab): void {
    this.status.set(status);
  }

  protected toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.desc.update((value) => !value);
    } else {
      this.sortKey.set(key);
      // Busiest first is the useful direction for a count.
      this.desc.set(key === 'users' || key === 'menus');
    }
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (this.sortKey() !== key) {
      return 'none';
    }
    return this.desc() ? 'descending' : 'ascending';
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.status.set('All');
  }

  protected retry(): void {
    this.store.refresh();
  }

  // ─── Status actions ─────────────────────────────────────────────────────────

  /** Allowing a role again for new uses is safe and reversible, so it goes straight through. */
  protected activate(row: RoleRow): void {
    this.run(
      row,
      this.api.activate(row.roleId),
      `${roleLabel(row.role)} is active again, and offered for new user mappings, approval steps and authority levels.`,
      `${roleLabel(row.role)} was already active. Nothing changed.`,
    );
  }

  protected requestDeactivate(row: RoleRow): void {
    this.pendingDeactivation.set(row);
  }

  protected confirmDeactivate(): void {
    const row = this.pendingDeactivation();
    this.pendingDeactivation.set(null);
    if (!row) {
      return;
    }
    this.run(
      row,
      this.api.deactivate(row.roleId),
      `${roleLabel(row.role)} deactivated. It can no longer be given out; everyone who holds it keeps it.`,
      `${roleLabel(row.role)} was already inactive. Nothing changed.`,
    );
  }

  /**
   * The confirm body. Deactivating sounds like it takes access away and it does not — no
   * legacy procedure reads the column — so the message says exactly what does and does not
   * change, with this role's own numbers.
   */
  protected readonly deactivateMessage = computed(() => {
    const row = this.pendingDeactivation();
    if (!row) {
      return '';
    }
    const kept = [
      row.users > 0 ? `${plural(row.users, 'account')} keep it` : '',
      int(row.role.menuGrantCount) > 0 ? `its ${plural(int(row.role.menuGrantCount), 'menu grant')} stand` : '',
      int(row.role.approvalHierarchyLevelCount) > 0 ? 'claims already in approval still reach it' : '',
    ].filter(Boolean);
    const revokes =
      kept.length > 0
        ? `It revokes nothing: ${kept.join(', ')}.`
        : 'Nothing uses it today, so nothing else changes.';
    const retire =
      row.users > 0 ? ' To retire it fully, move its accounts to another role in User Mapping.' : '';
    return (
      `${roleLabel(row.role)} will be refused for new user mappings, approval hierarchy steps and ` +
      `authority levels, and hidden from role pickers. ${revokes}${retire}`
    );
  });

  private run(
    row: RoleRow,
    action$: Observable<Octane2RoleWriteResponse>,
    changedMessage: string,
    unchangedMessage: string,
  ): void {
    this.busyId.set(row.roleId);
    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.store.upsert(response.role);
        this.busyId.set(null);
        // An empty changedFields means the server wrote nothing — never report that as a change.
        if (response.changedFields.length > 0) {
          this.notifications.success(changedMessage);
        } else {
          this.notifications.info(unchangedMessage);
        }
      },
      // The error interceptor raises the toast; clearing the busy flag is all that is left.
      error: () => this.busyId.set(null),
    });
  }
}
