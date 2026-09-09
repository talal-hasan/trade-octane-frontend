import { Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { int } from '../../../../core/api/api.types';
import {
  MenuActivation,
  MenuOctane,
  MenuResponse,
} from '../../../../core/api/admin.models';
import { BLUEPRINT_BY_MENU_ID } from '../../../../core/menu/menu-blueprint';
import { NotificationService } from '../../../../core/services/notification.service';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminMenusApi } from '../../services/admin-menus.api';

/**
 * Add / edit a menu item — legacy's "Add Menu".
 *
 * Two things about this screen are worth knowing before changing it.
 *
 * **A new menu row is invisible until somebody grants it.** Creating one does not give
 * anybody access; `MenuWriteResponse.requiresAccessGrant` says so explicitly on update. The
 * form states it up front rather than letting an admin create a row, see a success toast,
 * and wonder why nothing appeared.
 *
 * **`menuPage` is the legacy page identifier, and `menuId` is what this application's
 * navigation keys on.** A row created here will not appear in the new portal's nav until it
 * gets a blueprint entry (`core/menu/menu-blueprint.ts`) — until then it renders under
 * "More" pointing at the legacy placeholder. The form says which of the two it is.
 */
@Component({
  selector: 'to-menu-form',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
    SkeletonComponent,
  ],
  templateUrl: './menu-form.component.html',
  styleUrl: './menu-form.component.scss',
})
export class MenuFormComponent {
  /** Route param. Absent for create. Bound via `withComponentInputBinding()`. */
  readonly menuId = input<string | undefined>(undefined);

  private readonly api = inject(AdminMenusApi);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly existing = signal<MenuResponse | null>(null);
  protected readonly parents = signal<readonly MenuResponse[]>([]);
  protected readonly iconNames = signal<readonly string[]>([]);

  protected readonly isEdit = computed(() => !!this.menuId());

  protected readonly octanes: MenuOctane[] = ['Octane1', 'Octane2'];
  protected readonly activations: MenuActivation[] = ['Active', 'Hidden'];

  protected readonly form = this.fb.nonNullable.group({
    menuName: ['', [Validators.required]],
    menuPage: ['', [Validators.required]],
    parentId: [0],
    orderId: [0],
    icons: [''],
    octane: ['Octane1' as MenuOctane, [Validators.required]],
    activation: ['Active' as MenuActivation, [Validators.required]],
  });

  constructor() {
    this.loadIcons();
    this.loadParents();

    effect(() => {
      const id = this.menuId();
      if (id) {
        this.loadMenu(Number(id));
      }
    });
  }

  private loadIcons(): void {
    this.api
      .icons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (names) => this.iconNames.set(names),
        error: () => this.iconNames.set([]),
      });
  }

  /** Root rows only — the menu is two levels, so a child cannot itself be a parent. */
  private loadParents(): void {
    this.api
      .list({ rootsOnly: true, pageSize: 200, sort: 'MenuName' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => this.parents.set(page.items ?? []),
        error: () => this.parents.set([]),
      });
  }

  private loadMenu(menuId: number): void {
    if (!Number.isFinite(menuId)) {
      return;
    }
    this.loading.set(true);
    this.api
      .get(menuId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (menu) => {
          this.existing.set(menu);
          this.form.patchValue({
            menuName: menu.menuName,
            menuPage: menu.menuPage,
            parentId: int(menu.parentId),
            orderId: int(menu.orderId),
            icons: menu.icons ?? '',
            octane: menu.octane,
            activation: menu.activation === 'Unset' ? 'Active' : menu.activation,
          });
          this.form.markAsPristine();
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  /** Whether this application's navigation already knows what to do with the row. */
  protected readonly isMapped = computed(() => {
    const id = this.menuId();
    return id ? BLUEPRINT_BY_MENU_ID.has(Number(id)) : false;
  });

  protected submit(): void {
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request = {
      menuName: value.menuName.trim(),
      menuPage: value.menuPage.trim(),
      parentId: value.parentId || null,
      orderId: value.orderId || null,
      icons: value.icons.trim() || null,
      octane: value.octane,
      activation: value.activation,
    };

    this.saving.set(true);
    const id = this.menuId();

    if (id) {
      this.api
        .update(Number(id), request)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.saving.set(false);
            this.existing.set(response.menu);
            this.form.markAsPristine();
            this.notifications.success(
              response.requiresAccessGrant
                ? 'Menu updated. Nobody can see it yet — it still needs an access grant.'
                : 'Menu updated.',
            );
          },
          error: () => this.saving.set(false),
        });
      return;
    }

    this.api
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          // POST declares no response body, so there is no id to navigate to — back to the
          // grid, where the new row will be visible.
          this.notifications.success(
            `${request.menuName} created. Grant it to a role or a user before anyone can see it.`,
          );
          this.router.navigate(['/admin/menus']);
        },
        error: () => this.saving.set(false),
      });
  }
}
