import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';

import { csvFilename, saveBlob } from '../../../../core/api/api-client.service';
import { UserResponse, UserSortField, UserStatusFilter } from '../../../../core/api/admin.models';
import { CursorPager, pageMetrics } from '../../../../core/api/cursor-pager';
import { int } from '../../../../core/api/api.types';
import { NotificationService } from '../../../../core/services/notification.service';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminUsersApi } from '../../services/admin-users.api';
import {
  MENU_CREATE_USER,
  USER_STATUS_LABELS,
  USER_STATUS_PILL,
  UserRowStatus,
  initialsOf,
  userStatusOf,
} from '../user.util';

interface StatusTab {
  key: UserStatusFilter;
  label: string;
}

/**
 * The user directory — the list half of the screen that absorbed seven legacy menu rows.
 *
 * Analysis mode (CLAUDE.md §7): dense table, filters prominent, export in reach. The row
 * actions here are only the ones that are safe from a list — activate, deactivate, unlock.
 * Anything that needs context (roles, regions, brands, access) lives on the detail screen,
 * because granting access from a list row is how people grant the wrong thing.
 */
@Component({
  selector: 'to-user-list',
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
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent {
  private readonly usersApi = inject(AdminUsersApi);
  private readonly notifications = inject(NotificationService);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly statusLabels = USER_STATUS_LABELS;
  protected readonly statusPill = USER_STATUS_PILL;
  protected readonly initialsOf = initialsOf;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, index) => index);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly busyUserId = signal<string | null>(null);
  protected readonly rows = signal<readonly UserResponse[]>([]);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly status = signal<UserStatusFilter>('All');
  protected readonly sort = signal<UserSortField>('FullName');
  protected readonly desc = signal(false);

  private readonly pager = new CursorPager(25);
  protected readonly pagerState = this.pager.state;

  /** Only offered if the user holds "Create User" (menuId 17). */
  protected readonly canCreate = computed(() => this.menuAccess.hasMenu(MENU_CREATE_USER));

  protected readonly tabs: StatusTab[] = [
    { key: 'All', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Inactive', label: 'Inactive' },
    { key: 'Locked', label: 'Locked' },
    { key: 'PendingFirstLogin', label: 'Pending first sign-in' },
  ];

  /** Deactivation is the one row action that needs confirming — it drops cached grants. */
  protected readonly pendingDeactivation = signal<UserResponse | null>(null);

  private readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      startWith(''),
      takeUntilDestroyed(this.destroyRef),
    ),
    { initialValue: '' },
  );

  constructor() {
    this.load();
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  private query(includeCursor: boolean) {
    return {
      search: this.search().trim() || undefined,
      status: this.status() === 'All' ? undefined : this.status(),
      sort: this.sort(),
      desc: this.desc(),
      ...(includeCursor ? { pageSize: this.pager.pageSize(), cursor: this.pager.cursor() } : {}),
    };
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);

    this.usersApi
      .list(this.query(true))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.rows.set(page.data ?? []);
          this.pager.absorb(pageMetrics(page));
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  /** Any filter change voids every held cursor — see CursorPager. */
  private reload(): void {
    this.pager.reset();
    this.load();
  }

  protected onSearch(): void {
    this.reload();
  }

  protected setStatus(status: UserStatusFilter): void {
    if (this.status() === status) {
      return;
    }
    this.status.set(status);
    this.reload();
  }

  protected toggleSort(field: UserSortField): void {
    if (this.sort() === field) {
      this.desc.update((value) => !value);
    } else {
      this.sort.set(field);
      this.desc.set(false);
    }
    this.reload();
  }

  protected nextPage(): void {
    if (this.pager.next()) {
      this.load();
    }
  }

  protected previousPage(): void {
    if (this.pager.previous()) {
      this.load();
    }
  }

  protected retry(): void {
    this.reload();
  }

  // ─── Row actions ────────────────────────────────────────────────────────────

  protected statusOf(user: UserResponse): UserRowStatus {
    return userStatusOf(user);
  }

  protected activate(user: UserResponse): void {
    this.runRowAction(user, this.usersApi.activate(user.userId), `${user.fullName} activated.`);
  }

  protected requestDeactivate(user: UserResponse): void {
    this.pendingDeactivation.set(user);
  }

  protected confirmDeactivate(): void {
    const user = this.pendingDeactivation();
    this.pendingDeactivation.set(null);
    if (!user) {
      return;
    }
    this.runRowAction(
      user,
      this.usersApi.deactivate(user.userId),
      `${user.fullName} deactivated. Their cached grants have been dropped.`,
    );
  }

  protected unlock(user: UserResponse): void {
    this.runRowAction(
      user,
      this.usersApi.unlock(user.userId),
      `${user.fullName} unlocked. Their password is unchanged.`,
    );
  }

  /**
   * Applies a row action and patches that row in place from the response.
   *
   * Patching rather than refetching is deliberate: the endpoints return the updated
   * `UserResponse`, and a refetch would re-issue the cursor query and could bounce the
   * admin somewhere else in the list mid-task.
   */
  private runRowAction(
    user: UserResponse,
    action$: ReturnType<AdminUsersApi['activate']>,
    successMessage: string,
  ): void {
    this.busyUserId.set(user.userId);
    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.rows.update((rows) =>
          rows.map((row) => (row.userId === updated.userId ? updated : row)),
        );
        this.busyUserId.set(null);
        this.notifications.success(successMessage);
      },
      // The error interceptor raises the toast; clearing the busy flag is all that is left.
      error: () => this.busyUserId.set(null),
    });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    // Exports the *filtered* set — the same query the grid is showing. Issuing a bare
    // request here would silently hand the admin the whole directory instead.
    this.usersApi
      .exportCsv(this.query(false))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('trade-octane-users'));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  protected formatDate(value: string | null): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(date);
  }

  protected readonly totalLabel = computed(() => {
    const { rangeFrom, rangeTo, totalCount } = this.pagerState();
    if (totalCount === 0) {
      return 'No users';
    }
    return `${rangeFrom}–${rangeTo} of ${int(totalCount).toLocaleString('en-PK')}`;
  });
}
