import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { RoleAccessResponse } from '../../../../core/api/admin.models';
import { intSet } from '../../../../core/api/api.types';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AccessTreeComponent } from '../../shared/access-tree/access-tree.component';
import { AdminAccessApi } from '../../services/admin-access.api';

/**
 * One role's menu access.
 *
 * The difference between this and the user access tab is **who it changes**. Editing a
 * user's direct grants affects one person; editing a role's grants affects everyone
 * holding it, which the response reports as `affectedUserCount` and `affectedUserIds`.
 *
 * So this screen does two things the user screen does not:
 *   • states the reach up front, from `userCount` / `activeUserCount`
 *   • confirms before saving, naming the number of people about to be affected
 *
 * There is no inheritance here — a role is the source of inherited access, not a
 * recipient of it — so every row in the tree is editable.
 */
@Component({
  selector: 'to-role-access',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
    AccessTreeComponent,
  ],
  templateUrl: './role-access.component.html',
  styleUrl: './role-access.component.scss',
})
export class RoleAccessComponent {
  /** Bound from the route via `withComponentInputBinding()`. */
  readonly roleId = input.required<string>();

  private readonly accessApi = inject(AdminAccessApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly saving = signal(false);
  protected readonly confirming = signal(false);
  protected readonly access = signal<RoleAccessResponse | null>(null);
  protected readonly selection = signal<ReadonlySet<number>>(new Set<number>());
  private readonly original = signal<ReadonlySet<number>>(new Set<number>());

  protected readonly filterControl = this.fb.nonNullable.control('');
  protected readonly filter = signal('');

  constructor() {
    effect(() => {
      const id = Number(this.roleId());
      if (Number.isFinite(id)) {
        this.load(id);
      }
    });
  }

  private load(roleId: number): void {
    this.loading.set(true);
    this.failed.set(false);
    this.accessApi
      .roleAccess(roleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.access.set(response);
          const granted = intSet(response.menuIds);
          this.selection.set(granted);
          this.original.set(new Set(granted));
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected readonly dirty = computed(() => {
    const original = this.original();
    const current = this.selection();
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

  /** What the save will change, so the confirmation can be specific rather than generic. */
  protected readonly pendingChange = computed(() => {
    const original = this.original();
    const current = this.selection();
    const added = [...current].filter((id) => !original.has(id)).length;
    const removed = [...original].filter((id) => !current.has(id)).length;
    return { added, removed };
  });

  protected readonly confirmMessage = computed(() => {
    const role = this.access();
    const { added, removed } = this.pendingChange();
    const users = Number(role?.activeUserCount ?? 0);
    const parts: string[] = [];
    if (added > 0) {
      parts.push(`${added} item(s) granted`);
    }
    if (removed > 0) {
      parts.push(`${removed} item(s) revoked`);
    }
    const change = parts.join(' and ') || 'No changes';
    return `${change}. This takes effect immediately for ${users} active user${users === 1 ? '' : 's'} holding ${role?.roleName ?? 'this role'}.`;
  });

  protected onToggled(event: { menuId: number; checked: boolean }): void {
    this.selection.update((current) => {
      const next = new Set(current);
      if (event.checked) {
        next.add(event.menuId);
      } else {
        next.delete(event.menuId);
      }
      return next;
    });
  }

  protected onFilter(value: string): void {
    this.filter.set(value);
  }

  protected confirmSave(): void {
    this.confirming.set(false);
    const id = Number(this.roleId());
    if (!Number.isFinite(id) || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.accessApi
      .replaceRoleAccess(id, [...this.selection()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.access.set(response.access);
          const granted = intSet(response.access.menuIds);
          this.selection.set(granted);
          this.original.set(new Set(granted));
          this.saving.set(false);
          const affected = Number(response.affectedUserCount ?? 0);
          this.notifications.success(
            `Role access saved. ${affected} user${affected === 1 ? '' : 's'} affected.`,
          );
        },
        error: () => this.saving.set(false),
      });
  }

  protected discard(): void {
    this.selection.set(new Set(this.original()));
  }

  protected retry(): void {
    this.load(Number(this.roleId()));
  }
}
