import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';

import { NotificationService } from '../../../../core/services/notification.service';
import { ROLE_LABELS } from '../../../../core/models/role.model';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import {
  AdminUser,
  USER_TYPE_LABELS,
  UserStatus,
  UserType,
} from '../models/admin-user.model';
import { AdminUsersService } from '../services/admin-users.service';

type TypeFilter = 'all' | UserType;

@Component({
  selector: 'to-user-list',
  standalone: true,
  imports: [
    RouterLink,
    TablerIconComponent,
    ButtonModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './user-list.component.html',
  styleUrl: './user-list.component.scss',
})
export class UserListComponent {
  private readonly usersService = inject(AdminUsersService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly typeLabels = USER_TYPE_LABELS;

  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly typeFilter = signal<TypeFilter>('all');
  protected readonly skeletonRows = Array.from({ length: 6 }, (_, i) => i);

  protected readonly tabs: { key: TypeFilter; label: string }[] = [
    { key: 'all', label: 'All users' },
    { key: 'ad', label: 'Company' },
    { key: 'distributor', label: 'Distributor' },
    { key: 'temporary', label: 'Temporary' },
  ];

  private readonly users = this.usersService.users;

  protected readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const type = this.typeFilter();
    return this.users().filter((user) => {
      if (type !== 'all' && user.userType !== type) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        user.roles.some((role) => ROLE_LABELS[role].toLowerCase().includes(term))
      );
    });
  });

  protected readonly countFor = (tab: TypeFilter): number =>
    tab === 'all'
      ? this.users().length
      : this.users().filter((user) => user.userType === tab).length;

  // Temporary accounts auto-disable on their end date via a nightly job (KT Meeting 2 §3).
  // Surfacing the ones expiring soon is the whole reason an admin visits this screen
  // proactively rather than reactively.
  protected readonly expiringSoon = computed(() =>
    this.users().filter((user) => {
      if (user.userType !== 'temporary' || !user.endDate || user.status !== 'active') {
        return false;
      }
      const days = Math.ceil((new Date(user.endDate).getTime() - Date.now()) / 86_400_000);
      return days >= 0 && days <= 30;
    }),
  );

  constructor() {
    this.load();
  }

  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectTab(tab: TypeFilter): void {
    this.typeFilter.set(tab);
  }

  protected retry(): void {
    this.load();
  }

  protected toggleStatus(user: AdminUser): void {
    if (this.busyId()) {
      return;
    }
    const next: UserStatus = user.status === 'active' ? 'disabled' : 'active';
    this.busyId.set(user.id);
    this.usersService
      .setStatus(user.id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.busyId.set(null);
          if (next === 'disabled') {
            this.notifications.warn(`${updated.name} can no longer sign in.`, 'Access revoked');
          } else {
            this.notifications.success(`${updated.name} can sign in again.`, 'Access restored');
          }
        },
        error: () => {
          this.busyId.set(null);
          this.notifications.error('Could not change that user’s status. Please try again.');
        },
      });
  }

  protected initialsOf(name: string): string {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.usersService
      .refresh()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loading.set(false),
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }
}
