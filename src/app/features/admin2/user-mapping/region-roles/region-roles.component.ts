import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import {
  EMPTY,
  Observable,
  catchError,
  debounceTime,
  distinctUntilChanged,
  expand,
  map,
  of,
  reduce,
  switchMap,
  tap,
} from 'rxjs';

import {
  UserMappingRegionRoleFilter,
  UserMappingRegionRoleRowResponse,
  UserMappingRegionRolesResponse,
  UserMappingRoleCountResponse,
  UserMappingUserStatus,
} from '../../../../core/api/admin2.models';
import { int } from '../../../../core/api/api.types';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { Admin2UserMappingApi } from '../../services/admin2-user-mapping.api';
import { RegionRoleAccount, groupRowsByAccount } from '../user-mapping.util';

/** What the drawer is showing: a region, a role across regions, or one of the gaps. */
interface Drill {
  title: string;
  subtitle: string;
  regionCode?: string;
  withoutRegion?: boolean;
  roleId?: number;
  withoutRole?: boolean;
  /** The region's role breakdown, to narrow the list by. Empty when drilling into a role. */
  roles: UserMappingRoleCountResponse[];
}

/** Within a region: every role, one role, or the accounts with none. */
type DrillRole = number | 'none' | null;

interface RegionRow {
  key: string;
  code: string | null;
  name: string;
  flag: string;
  users: number;
  activeUsers: number;
  rolesHeld: number;
  roles: UserMappingRoleCountResponse[];
  top: UserMappingRoleCountResponse[];
  more: number;
}

/** One region's server page, or every account a role drawer spans, grouped and paged here. */
type DrillResult =
  | { kind: 'page'; accounts: RegionRoleAccount[]; total: number; page: number; hasNext: boolean }
  | { kind: 'accounts'; accounts: RegionRoleAccount[] };

const PAGE_SIZE = 25;
/** The API's MaxPageSize. A larger request is clamped, and nextPage still walks the rest. */
const ALL_ROWS_PAGE_SIZE = 200;
const TOP_ROLES = 4;
const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Roles by region — how many accounts hold each role in each region, and who they are.
 * Asked for by the client; legacy had no view of it.
 *
 * Analysis mode (CLAUDE.md §7). A region × role grid was the obvious shape and the wrong
 * one: 30 roles are held across 15 regions, so it would be a wide, mostly empty table. Each
 * region is a row instead, with its account count and its busiest roles, and **every count
 * opens the accounts behind it** in a drawer — narrowed by role there, and one click from
 * any account's mapping.
 *
 * The counts are the server's (`/region-roles`), and the drawer's list takes the same
 * filters (`/region-roles/users`), so a number and its list always agree.
 */
@Component({
  selector: 'to-admin2-region-roles',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    DrawerModule,
    InputTextModule,
    SelectModule,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './region-roles.component.html',
  styleUrl: './region-roles.component.scss',
})
export class RegionRolesComponent {
  /** Asks the screen to open this account's mapping. */
  readonly openUser = output<string>();

  private readonly api = inject(Admin2UserMappingApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, index) => index);

  // ─── Filters ────────────────────────────────────────────────────────────────

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly search = toSignal(
    this.searchControl.valueChanges.pipe(
      debounceTime(300),
      map((value) => value.trim()),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef),
    ),
    { initialValue: '' },
  );

  protected readonly status = signal<UserMappingUserStatus>('All');
  protected readonly statuses: UserMappingUserStatus[] = ['All', 'Active', 'Inactive'];

  protected readonly roleControl = new FormControl<number | null>(null);
  private readonly roleId = toSignal(this.roleControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)), {
    initialValue: null,
  });

  protected readonly roleOptions = toSignal(
    this.api.catalogue().pipe(
      map((catalogue) =>
        catalogue.roles
          .map((role) => ({ id: int(role.roleId), name: role.roleName }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
      catchError(() => of([])),
    ),
    { initialValue: [] },
  );

  /** Bumped by Try again, so the same filters are asked for once more. */
  private readonly reload = signal(0);

  private readonly filter = computed<UserMappingRegionRoleFilter>(() => {
    this.reload();
    return {
      search: this.search() || undefined,
      status: this.status() === 'All' ? undefined : this.status(),
      roleId: this.roleId() ?? undefined,
    };
  });

  // ─── Counts ─────────────────────────────────────────────────────────────────

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly data = signal<UserMappingRegionRolesResponse | null>(null);

  protected readonly census = computed(() => {
    const data = this.data();
    if (!data) {
      return null;
    }
    const users = int(data.totalUsers);
    const withoutRegion = int(data.regions.find((region) => region.regionCode === null)?.userCount);
    return {
      users,
      regions: data.regions.filter((region) => region.regionCode !== null && int(region.userCount) > 0).length,
      withoutRegion,
      withoutRole: int(data.roleTotals.find((role) => role.roleId === null)?.userCount),
      mappedAccounts: users - withoutRegion,
      regionMappings: int(data.totalRegionAssignments),
    };
  });

  /** Region counts count an account once per region it holds, so they overlap — say so, with the totals. */
  protected readonly overlap = computed(() => {
    const census = this.census();
    if (!census || census.regionMappings <= census.mappedAccounts) {
      return null;
    }
    return {
      regionMappings: census.regionMappings.toLocaleString('en-PK'),
      accounts: census.mappedAccounts.toLocaleString('en-PK'),
      accountNoun: census.mappedAccounts === 1 ? 'account' : 'accounts',
    };
  });

  protected readonly roleTotals = computed(() =>
    (this.data()?.roleTotals ?? []).filter((role) => role.roleId !== null && int(role.userCount) > 0),
  );

  protected readonly regions = computed<RegionRow[]>(() =>
    (this.data()?.regions ?? []).map((region) => {
      const roles = region.roles.filter((role) => int(role.userCount) > 0);
      return {
        key: region.regionCode ?? '(none)',
        code: region.regionCode,
        name:
          region.regionCode === null
            ? 'No region'
            : region.regionName || region.regionShortName || region.regionCode,
        flag: region.regionCode === null ? '' : !region.regionExists ? 'Unknown code' : !region.regionIsActive ? 'Retired' : '',
        users: int(region.userCount),
        activeUsers: int(region.activeUserCount),
        rolesHeld: roles.filter((role) => role.roleId !== null).length,
        roles,
        top: roles.slice(0, TOP_ROLES),
        more: Math.max(0, roles.length - TOP_ROLES),
      };
    }),
  );

  protected readonly maxRegionUsers = computed(() => Math.max(1, ...this.regions().map((region) => region.users)));

  // ─── Drill-down ─────────────────────────────────────────────────────────────

  protected readonly drill = signal<Drill | null>(null);
  protected readonly drillRole = signal<DrillRole>(null);
  protected readonly page = signal(1);

  protected readonly rowsLoading = signal(false);
  private readonly drillResult = signal<DrillResult | null>(null);

  private readonly drillQuery = computed(() => {
    const drill = this.drill();
    if (!drill) {
      return null;
    }
    const role = this.drillRole();
    const withoutRole = role === 'none' || drill.withoutRole === true;
    const filter: UserMappingRegionRoleFilter = {
      ...this.filter(),
      regionCode: drill.regionCode,
      withoutRegion: drill.withoutRegion || undefined,
      roleId: withoutRole ? undefined : typeof role === 'number' ? role : (drill.roleId ?? this.filter().roleId),
      withoutRole: withoutRole || undefined,
    };
    // A drawer spanning regions repeats accounts per region, so it loads them all and pages by account.
    if (drill.regionCode === undefined && !drill.withoutRegion) {
      return { kind: 'accounts' as const, filter };
    }
    return { kind: 'page' as const, filter, page: this.page() };
  });

  /** The drawer's current page of accounts, however they were paged. */
  protected readonly drillPage = computed(() => {
    const result = this.drillResult();
    if (!result) {
      return null;
    }
    if (result.kind === 'page') {
      return { ...result, showRegions: false };
    }
    const page = this.page();
    const start = (page - 1) * PAGE_SIZE;
    return {
      accounts: result.accounts.slice(start, start + PAGE_SIZE),
      total: result.accounts.length,
      page,
      hasNext: start + PAGE_SIZE < result.accounts.length,
      showRegions: true,
    };
  });

  protected readonly pageLabel = computed(() => {
    const view = this.drillPage();
    if (!view || view.total === 0) {
      return 'No accounts';
    }
    const from = (view.page - 1) * PAGE_SIZE + 1;
    const to = Math.min(view.total, view.page * PAGE_SIZE);
    return `${from}–${to} of ${view.total} ${view.total === 1 ? 'account' : 'accounts'}`;
  });

  constructor() {
    toObservable(this.filter)
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.failed.set(false);
        }),
        // A newer filter cancels the request for an older one, so a slow response never
        // overwrites a faster, newer one.
        switchMap((filter) =>
          this.api.regionRoles(filter).pipe(
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((data) => {
        this.loading.set(false);
        if (data) {
          this.data.set(data);
        }
      });

    toObservable(this.drillQuery)
      .pipe(
        switchMap((query): Observable<DrillResult | null> => {
          if (!query) {
            return of(null);
          }
          this.rowsLoading.set(true);
          const result$: Observable<DrillResult> =
            query.kind === 'accounts'
              ? this.allAccounts(query.filter).pipe(map((accounts) => ({ kind: 'accounts' as const, accounts })))
              : this.api
                  .regionRoleUsers(query.filter, { sort: 'Role', page: query.page, pageSize: PAGE_SIZE })
                  .pipe(
                    map((response) => ({
                      kind: 'page' as const,
                      accounts: groupRowsByAccount(response.items),
                      total: int(response.totalCount),
                      page: int(response.page, 1),
                      hasNext: int(response.nextPage) > int(response.page, 1),
                    })),
                  );
          return result$.pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.rowsLoading.set(false);
        this.drillResult.set(result);
      });
  }

  /** Every row for the filter, following nextPage, folded into one entry per account by name. */
  private allAccounts(filter: UserMappingRegionRoleFilter): Observable<RegionRoleAccount[]> {
    const fetchPage = (page: number) =>
      this.api.regionRoleUsers(filter, { sort: 'User', page, pageSize: ALL_ROWS_PAGE_SIZE });
    return fetchPage(1).pipe(
      expand((response) => {
        const next = int(response.nextPage);
        return next > int(response.page, 1) ? fetchPage(next) : EMPTY;
      }),
      reduce((rows: UserMappingRegionRoleRowResponse[], response) => rows.concat(response.items), []),
      map((rows) =>
        groupRowsByAccount(rows).sort((a, b) => COLLATOR.compare(a.fullName || a.userId, b.fullName || b.userId)),
      ),
    );
  }

  protected setStatus(status: UserMappingUserStatus): void {
    this.status.set(status);
  }

  protected retry(): void {
    this.reload.update((count) => count + 1);
  }

  // ─── Opening the drawer ─────────────────────────────────────────────────────

  protected openRegion(region: RegionRow, role: DrillRole = null): void {
    this.open(
      {
        title: region.name,
        subtitle: `${region.users} ${region.users === 1 ? 'account' : 'accounts'} · ${region.rolesHeld} ${region.rolesHeld === 1 ? 'role' : 'roles'}`,
        regionCode: region.code ?? undefined,
        withoutRegion: region.code === null,
        roles: region.roles,
      },
      role,
    );
  }

  protected openRole(role: UserMappingRoleCountResponse): void {
    const users = int(role.userCount);
    this.open({
      title: role.roleName || `Role ${role.roleId}`,
      subtitle: `${users} ${users === 1 ? 'account' : 'accounts'}, across every region`,
      roleId: role.roleId === null ? undefined : int(role.roleId),
      withoutRole: role.roleId === null,
      roles: [],
    });
  }

  protected openWithoutRegion(): void {
    const region = this.regions().find((row) => row.code === null);
    if (region) {
      this.openRegion(region);
    }
  }

  protected openWithoutRole(): void {
    const users = this.census()?.withoutRole ?? 0;
    this.open({
      title: 'No role',
      subtitle: `${users} ${users === 1 ? 'account holds' : 'accounts hold'} no role`,
      withoutRole: true,
      roles: [],
    });
  }

  private open(drill: Drill, role: DrillRole = null): void {
    this.drillResult.set(null);
    this.page.set(1);
    this.drillRole.set(role);
    this.drill.set(drill);
  }

  protected closeDrill(): void {
    this.drill.set(null);
  }

  protected setDrillRole(role: UserMappingRoleCountResponse | null): void {
    this.page.set(1);
    this.drillRole.set(role === null ? null : role.roleId === null ? 'none' : int(role.roleId));
  }

  protected isDrillRole(role: UserMappingRoleCountResponse | null): boolean {
    const current = this.drillRole();
    if (role === null) {
      return current === null;
    }
    return role.roleId === null ? current === 'none' : current === int(role.roleId);
  }

  protected previousPage(): void {
    this.page.update((page) => Math.max(1, page - 1));
  }

  protected nextPage(): void {
    if (this.drillPage()?.hasNext) {
      this.page.update((page) => page + 1);
    }
  }

  protected barWidth(users: number): number {
    return Math.round((users / this.maxRegionUsers()) * 100);
  }

  protected readonly int = int;
}
