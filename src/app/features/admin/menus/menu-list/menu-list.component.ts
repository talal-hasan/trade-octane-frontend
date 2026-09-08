import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';

import { csvFilename, saveBlob } from '../../../../core/api/api-client.service';
import {
  MenuActivation,
  MenuOctane,
  MenuResponse,
  MenuStatusFilter,
} from '../../../../core/api/admin.models';
import { CursorPager } from '../../../../core/api/cursor-pager';
import { int } from '../../../../core/api/api.types';
import { BLUEPRINT_BY_MENU_ID } from '../../../../core/menu/menu-blueprint';
import { NotificationService } from '../../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { AdminMenusApi } from '../../services/admin-menus.api';

/**
 * The menu catalogue.
 *
 * This screen has **no legacy menu row** — the eight `Add Menu` endpoints are fully
 * specified in the contract but appear nowhere in `/identity/menu`, so it is gated on
 * being an administrator rather than on a grant (see ADMIN_ONLY_ROUTES).
 *
 * It matters more here than it looks, because this table is the **input to the menu
 * blueprint**. `menuId` is the join key the whole navigation fold keys on, and `menuPage`
 * is the legacy page name that lets a mapping be verified across environments. So the grid
 * shows both prominently, and marks which rows the blueprint already maps — a row that is
 * granted, active, and unmapped is precisely a nav item that will land on the legacy
 * placeholder, and this is where you would notice.
 */
@Component({
  selector: 'to-menu-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './menu-list.component.html',
  styleUrl: './menu-list.component.scss',
})
export class MenuListComponent {
  private readonly menusApi = inject(AdminMenusApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = Array.from({ length: 10 }, (_, index) => index);

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly busyMenuId = signal<number | null>(null);
  protected readonly rows = signal<readonly MenuResponse[]>([]);
  protected readonly mismatchCount = signal(0);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly octane = signal<MenuOctane>('Octane1');
  protected readonly status = signal<MenuStatusFilter>('All');

  private readonly pager = new CursorPager(50);
  protected readonly pagerState = this.pager.state;

  protected readonly octaneTabs: { key: MenuOctane; label: string }[] = [
    { key: 'Octane1', label: 'Administration 1.0' },
    { key: 'Octane2', label: 'Administration 2.0' },
  ];

  protected readonly statusTabs: { key: MenuStatusFilter; label: string }[] = [
    { key: 'All', label: 'All' },
    { key: 'Active', label: 'Active' },
    { key: 'Hidden', label: 'Hidden' },
    { key: 'Unset', label: 'Unset' },
  ];

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

  private query(includeCursor: boolean) {
    return {
      search: this.search().trim() || undefined,
      octane: this.octane(),
      status: this.status() === 'All' ? undefined : this.status(),
      sort: 'TreeOrder' as const,
      ...(includeCursor ? { pageSize: this.pager.pageSize(), cursor: this.pager.cursor() } : {}),
    };
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.menusApi
      .list(this.query(true))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const items = page.items ?? [];
          this.rows.set(items);
          this.mismatchCount.set(int(page.activationMismatchCount));
          this.pager.absorb({
            nextCursor: page.nextCursor ?? null,
            totalCount: page.totalCount,
            pageSize: page.pageSize,
            rowCount: items.length,
          });
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  private reload(): void {
    this.pager.reset();
    this.load();
  }

  protected onSearch(): void {
    this.reload();
  }

  protected setOctane(octane: MenuOctane): void {
    if (this.octane() === octane) {
      return;
    }
    this.octane.set(octane);
    this.reload();
  }

  protected setStatus(status: MenuStatusFilter): void {
    if (this.status() === status) {
      return;
    }
    this.status.set(status);
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

  protected menuId(menu: MenuResponse): number {
    return int(menu.menuId);
  }

  /** Whether the navigation blueprint maps this row to a screen in the new portal. */
  protected isMapped(menu: MenuResponse): boolean {
    return BLUEPRINT_BY_MENU_ID.has(int(menu.menuId));
  }

  /**
   * Toggles between Active and Hidden.
   *
   * `Unset` is a third state the legacy data carries but that no UI should *create* — it
   * means nobody ever decided. The toggle therefore always writes an explicit value, and
   * an Unset row resolves to Active on first toggle rather than cycling through three
   * states nobody can predict.
   */
  protected toggleActivation(menu: MenuResponse): void {
    const id = int(menu.menuId);
    const next: MenuActivation = menu.activation === 'Active' ? 'Hidden' : 'Active';
    this.busyMenuId.set(id);

    this.menusApi
      .setActivation(id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.rows.update((rows) =>
            rows.map((row) => (int(row.menuId) === id ? response.menu : row)),
          );
          this.busyMenuId.set(null);
          this.notifications.success(
            next === 'Active' ? `${menu.menuName} is now visible.` : `${menu.menuName} is hidden.`,
          );
        },
        error: () => this.busyMenuId.set(null),
      });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.menusApi
      .exportCsv(this.query(false))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename(`trade-octane-menus-${this.octane().toLowerCase()}`));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  protected readonly totalLabel = computed(() => {
    const { rangeFrom, rangeTo, totalCount } = this.pagerState();
    if (totalCount === 0) {
      return 'No menu items';
    }
    return `${rangeFrom}–${rangeTo} of ${int(totalCount).toLocaleString('en-PK')}`;
  });
}
