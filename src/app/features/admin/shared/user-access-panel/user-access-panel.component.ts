import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Subscription } from 'rxjs';

import { UserAccessResponse } from '../../../../core/api/admin.models';
import { AdminApiRoot, intSet } from '../../../../core/api/api.types';
import { NotificationService } from '../../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminAccessApi } from '../../services/admin-access.api';
import { AccessTreeComponent } from '../access-tree/access-tree.component';

/**
 * One user's menu access: the tree, with role-supplied rows locked and direct grants
 * editable. The Administration 1.0 user Access tab, and Administration 2.0's User Mapping
 * (`apiRoot="admin2"`), where the tree is the Octane 2 menu and the role comes from the
 * Promo_Management_2 account.
 *
 * The checkboxes are bound to **direct** grants — the only set a save can change. Role rows
 * are shown locked, and the effective count is the union the sidebar is built from.
 */
@Component({
  selector: 'to-user-access-panel',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    EmptyStateComponent,
    SkeletonComponent,
    AccessTreeComponent,
  ],
  templateUrl: './user-access-panel.component.html',
  styleUrl: './user-access-panel.component.scss',
})
export class UserAccessPanelComponent {
  readonly userId = input.required<string>();
  readonly apiRoot = input<AdminApiRoot>('admin');

  /**
   * False when the account is deactivated — the client's rule of 2026-09-21: an inactive
   * user cannot be edited, activate it first.
   *
   * Defaults true because the other host of this panel (Administration 2.0's User Mapping)
   * reaches it through a different account population and decides for itself.
   */
  readonly editable = input(true);

  private readonly api = inject(AdminAccessApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** The access endpoints read `Promo_Management.dbo.USERS`, which a few 2.0 accounts are missing from. */
  protected readonly notFound = signal(false);
  protected readonly access = signal<UserAccessResponse | null>(null);
  protected readonly directSelection = signal<ReadonlySet<number>>(new Set<number>());
  private readonly originalDirect = signal<ReadonlySet<number>>(new Set<number>());
  protected readonly saving = signal(false);
  protected readonly filterControl = new FormControl('', { nonNullable: true });
  protected readonly filter = signal('');
  private request: Subscription | null = null;

  protected readonly isOctane2 = computed(() => this.apiRoot() === 'admin2');

  /** Role-supplied grants. Shown locked in the tree — a save here cannot remove them. */
  protected readonly roleMenuIds = computed(() => intSet(this.access()?.roleMenuIds ?? []));

  protected readonly roleNames = computed(() =>
    (this.access()?.roles ?? []).map((role) => role.roleName).filter(Boolean).join(', '),
  );

  /** Ticking is pointless when the save can never land, so the tree is locked instead. */
  protected readonly locked = computed(() => !this.editable());

  protected readonly dirty = computed(() => {
    const original = this.originalDirect();
    const current = this.directSelection();
    return original.size !== current.size || [...current].some((id) => !original.has(id));
  });

  constructor() {
    effect(() => {
      const userId = this.userId();
      const root = this.apiRoot();
      untracked(() => this.load(userId, root));
    });
  }

  hasUnsavedChanges(): boolean {
    return this.dirty() && !this.saving();
  }

  private load(userId: string, root: AdminApiRoot): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.failed.set(false);
    this.notFound.set(false);
    this.access.set(null);
    this.request = this.api
      .userAccess(userId, {}, root)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.access.set(response);
          const direct = intSet(response.directMenuIds);
          this.directSelection.set(direct);
          this.originalDirect.set(new Set(direct));
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
          } else {
            this.failed.set(true);
          }
        },
      });
  }

  protected retry(): void {
    this.load(this.userId(), this.apiRoot());
  }

  protected onToggled(event: { menuId: number; checked: boolean }): void {
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

  protected discard(): void {
    this.directSelection.set(new Set(this.originalDirect()));
  }

  protected save(): void {
    if (this.saving() || !this.dirty() || this.locked()) {
      return;
    }
    this.saving.set(true);
    this.api
      .replaceUserAccess(this.userId(), [...this.directSelection()], {}, this.apiRoot())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.access.set(response.access);
          const direct = intSet(response.access.directMenuIds);
          this.directSelection.set(direct);
          this.originalDirect.set(new Set(direct));
          this.saving.set(false);

          // Removed from direct grants but still supplied by a role: nothing changed for the
          // user, and saying only "saved" would hide that.
          const stillReachable = response.noLongerEffective?.length ?? 0;
          this.notifications.success(
            stillReachable > 0
              ? `Access updated. ${stillReachable} item(s) are still reachable through a role.`
              : 'Access updated.',
          );
        },
        error: () => this.saving.set(false),
      });
  }
}
