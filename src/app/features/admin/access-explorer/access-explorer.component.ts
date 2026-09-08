import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, debounceTime, distinctUntilChanged, map, startWith } from 'rxjs';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { CursorPage, int } from '../../../core/api/api.types';
import { CursorPager, pageMetrics } from '../../../core/api/cursor-pager';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { AdminAccessApi } from '../services/admin-access.api';
import { AdminRolesApi } from '../services/admin-roles.api';
import { AdminScopeApi } from '../services/admin-scope.api';

export type ExplorerSource = 'roles' | 'regions' | 'brands' | 'user-menus' | 'role-menus';

/** One cell of the unified grid. */
interface Cell {
  text: string;
  mono?: boolean;
  muted?: boolean;
}

/** A row, normalised across five differently-shaped endpoints. */
interface ExplorerRow {
  key: string;
  cells: Cell[];
  /** The row exists but authorises nothing — dead mapping, orphaned grant, retired code. */
  dead: boolean;
  deadReason: string | null;
}

interface SourceDescriptor {
  key: ExplorerSource;
  label: string;
  /** What the legacy screen called this, for recognition. */
  legacy: string;
  columns: string[];
}

const SOURCES: SourceDescriptor[] = [
  {
    key: 'roles',
    label: 'User → Role',
    legacy: 'Assign Role to User',
    columns: ['User', 'Login', 'Role', 'Status'],
  },
  {
    key: 'regions',
    label: 'User → Region',
    legacy: 'User Region Mapping',
    columns: ['User', 'Login', 'Region', 'Status'],
  },
  {
    key: 'brands',
    label: 'User → Brand',
    legacy: 'User Brand Mapping',
    columns: ['User', 'Login', 'Brand', 'Status'],
  },
  {
    key: 'user-menus',
    label: 'User → Menu',
    legacy: 'Access Control',
    columns: ['User', 'Login', 'Menu', 'Status'],
  },
  {
    key: 'role-menus',
    label: 'Role → Menu',
    legacy: 'Access Control | By Role',
    columns: ['Role', 'Users', 'Menu', 'Status'],
  },
];

/**
 * Every access mapping in the system, in one grid.
 *
 * The API exposes five cross-cutting mapping grids — `/admin/user-roles`,
 * `/user-regions`, `/user-brands`, `/user-menus`, `/role-menus`. They have **identical
 * shape**: cursor-paged, searchable, sortable, each with a CSV sibling. Legacy never
 * surfaced them as screens at all; they were the grids buried inside the individual
 * mapping pages, so answering "who has access to X" meant opening a page per mapping type
 * and reading each one.
 *
 * Five endpoints of the same shape is one screen with a source toggle, not five screens.
 * The "dead grant" filters are the reason this is worth building rather than merely
 * tidy: `orphanedOnly`, `deadOnly` and `danglingOnly` surface mappings that exist and
 * authorise nothing — the ones an admin believes are working.
 */
@Component({
  selector: 'to-access-explorer',
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
  templateUrl: './access-explorer.component.html',
  styleUrl: './access-explorer.component.scss',
})
export class AccessExplorerComponent {
  private readonly rolesApi = inject(AdminRolesApi);
  private readonly scopeApi = inject(AdminScopeApi);
  private readonly accessApi = inject(AdminAccessApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly sources = SOURCES;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, index) => index);

  protected readonly source = signal<ExplorerSource>('roles');
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly rows = signal<readonly ExplorerRow[]>([]);
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  /** Restrict to mappings that authorise nothing. The reason this screen earns its place. */
  protected readonly deadOnly = signal(false);

  private readonly pager = new CursorPager(50);
  protected readonly pagerState = this.pager.state;

  protected readonly descriptor = computed(
    () => SOURCES.find((entry) => entry.key === this.source()) ?? SOURCES[0],
  );

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

  protected setSource(source: ExplorerSource): void {
    if (this.source() === source) {
      return;
    }
    this.source.set(source);
    // A cursor is only valid for the query that issued it — and this is a different
    // endpoint entirely.
    this.pager.reset();
    this.load();
  }

  protected toggleDeadOnly(): void {
    this.deadOnly.update((value) => !value);
    this.pager.reset();
    this.load();
  }

  protected onSearch(): void {
    this.pager.reset();
    this.load();
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
    this.pager.reset();
    this.load();
  }

  private baseQuery(includeCursor: boolean) {
    return {
      search: this.search().trim() || undefined,
      ...(includeCursor ? { pageSize: this.pager.pageSize(), cursor: this.pager.cursor() } : {}),
    };
  }

  /**
   * Dispatches to the right endpoint and normalises the result.
   *
   * Each source maps its own row shape onto the same four cells, so the grid template does
   * not have to branch. The `dead` flag is computed per source from whichever field that
   * endpoint uses to express "this mapping cannot authorise anything" — `grantsAccess`
   * everywhere, plus `isOrphaned` on the menu grants.
   */
  private fetch(includeCursor: boolean): Observable<{ rows: ExplorerRow[]; page: CursorPage<unknown> }> {
    const base = this.baseQuery(includeCursor);
    const dead = this.deadOnly();

    switch (this.source()) {
      case 'regions':
        return this.scopeApi
          .listUserRegionGrants({ ...base, grantingOnly: dead ? undefined : undefined })
          .pipe(
            map((page) => ({
              page: page as CursorPage<unknown>,
              rows: (page.data ?? [])
                .filter((row) => !dead || !row.grantsAccess)
                .map((row) => ({
                  key: `${row.userId}:${row.regionCode}`,
                  cells: [
                    { text: row.fullName || row.userId },
                    { text: row.userId, mono: true },
                    { text: `${row.regionName} (${row.regionCode})` },
                  ],
                  dead: !row.grantsAccess,
                  deadReason: !row.regionExists
                    ? 'The region no longer exists in the master list.'
                    : !row.regionIsActive
                      ? 'The region is retired.'
                      : !row.userIsActive
                        ? 'The user is inactive.'
                        : null,
                })),
            })),
          );

      case 'brands':
        return this.scopeApi.listUserBrandGrants({ ...base }).pipe(
          map((page) => ({
            page: page as CursorPage<unknown>,
            rows: (page.data ?? [])
              .filter((row) => !dead || !row.grantsAccess)
              .map((row) => ({
                key: `${row.userId}:${row.brandCode}`,
                cells: [
                  { text: row.fullName || row.userId },
                  { text: row.userId, mono: true },
                  { text: `${row.brandName} (${row.brandCode})` },
                ],
                dead: !row.grantsAccess,
                deadReason: !row.brandExists
                  ? 'The brand no longer exists in the master list.'
                  : !row.brandIsActive
                    ? 'The brand is retired.'
                    : !row.userIsActive
                      ? 'The user is inactive.'
                      : null,
              })),
          })),
        );

      case 'user-menus':
        return this.accessApi
          .listUserMenuGrants({ ...base, deadOnly: dead || undefined })
          .pipe(
            map((page) => ({
              page: page as CursorPage<unknown>,
              rows: (page.data ?? []).map((row) => ({
                key: `${row.userId}:${String(row.menuId)}`,
                cells: [
                  { text: row.fullName || row.userId },
                  { text: row.userId, mono: true },
                  {
                    text: row.parentName ? `${row.parentName} › ${row.menuName}` : row.menuName,
                  },
                ],
                dead: !row.grantsAccess,
                deadReason: row.isOrphaned
                  ? 'The menu item this grant points at no longer exists.'
                  : !row.menuIsActive
                    ? 'The menu item is hidden.'
                    : row.alsoGrantedByRole
                      ? null
                      : !row.userIsActive
                        ? 'The user is inactive.'
                        : null,
              })),
            })),
          );

      case 'role-menus':
        return this.accessApi
          .listRoleMenuGrants({ ...base, deadOnly: dead || undefined })
          .pipe(
            map((page) => ({
              page: page as CursorPage<unknown>,
              rows: (page.data ?? []).map((row) => ({
                key: `${String(row.roleId)}:${String(row.menuId)}`,
                cells: [
                  { text: row.roleName },
                  { text: `${row.activeUserCount} active`, muted: true },
                  {
                    text: row.parentName ? `${row.parentName} › ${row.menuName}` : row.menuName,
                  },
                ],
                dead: !row.grantsAccess,
                deadReason: row.isOrphaned
                  ? 'The menu item this grant points at no longer exists.'
                  : !row.menuIsActive
                    ? 'The menu item is hidden.'
                    : !row.roleIsActive
                      ? 'The role is inactive.'
                      : null,
              })),
            })),
          );

      case 'roles':
      default:
        return this.rolesApi.listUserRoleGrants({ ...base }).pipe(
          map((page) => ({
            page: page as CursorPage<unknown>,
            rows: (page.data ?? [])
              .filter((row) => !dead || !row.grantsAccess)
              .map((row) => ({
                key: `${row.userId}:${String(row.roleId)}`,
                cells: [
                  { text: row.fullName || row.userId },
                  { text: row.userId, mono: true },
                  { text: row.roleName },
                ],
                dead: !row.grantsAccess,
                deadReason: !row.roleIsActive
                  ? 'The role is inactive.'
                  : !row.userIsActive
                    ? 'The user is inactive.'
                    : null,
              })),
          })),
        );
    }
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.fetch(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ rows, page }) => {
          this.rows.set(rows);
          this.pager.absorb({ ...pageMetrics(page), rowCount: rows.length });
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    const query = this.baseQuery(false);
    const dead = this.deadOnly();

    const request$ = (() => {
      switch (this.source()) {
        case 'regions':
          return this.scopeApi.exportUserRegionGrants(query);
        case 'brands':
          return this.scopeApi.exportUserBrandGrants(query);
        case 'user-menus':
          return this.accessApi.exportUserMenuGrants({ ...query, deadOnly: dead || undefined });
        case 'role-menus':
          return this.accessApi.exportRoleMenuGrants({ ...query, deadOnly: dead || undefined });
        default:
          return this.rolesApi.exportUserRoleGrants(query);
      }
    })();

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (blob) => {
        saveBlob(blob, csvFilename(`trade-octane-access-${this.source()}`));
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  protected readonly totalLabel = computed(() => {
    const { rangeFrom, rangeTo, totalCount } = this.pagerState();
    if (totalCount === 0) {
      return 'No mappings';
    }
    return `${rangeFrom}–${rangeTo} of ${int(totalCount).toLocaleString('en-PK')}`;
  });
}
