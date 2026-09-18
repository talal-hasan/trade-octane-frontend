import { ScrollingModule } from '@angular/cdk/scrolling';
import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { Observable, concat, debounceTime, distinctUntilChanged, last, map } from 'rxjs';

import {
  UserMappingCatalogueResponse,
  UserMappingResponse,
  UserMappingUserResponse,
  UserMappingWriteResponse,
} from '../../../../core/api/admin2.models';
import { int } from '../../../../core/api/api.types';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { UserAccessPanelComponent } from '../../../admin/shared/user-access-panel/user-access-panel.component';
import { Admin2UserMappingApi } from '../../services/admin2-user-mapping.api';
import { UserMappingUsersStore } from '../../services/user-mapping-users.store';
import {
  EMPTY_DRAFT,
  MappingDraft,
  RemovalStep,
  SavePlan,
  areasOutsideRegions,
  diffMapping,
  draftFrom,
  planSave,
  regionOfArea,
} from '../user-mapping.util';

export type MappingView = 'mapping' | 'access';

type UserFilter = 'all' | 'needs' | 'active' | 'inactive';

interface UserRow {
  user: UserMappingUserResponse;
  needsMapping: boolean;
  haystack: string;
}

interface GeoArea {
  code: string;
  name: string;
  /** Held, but gone from the catalogue or retired — shown so it can be seen and removed. */
  flag: string;
}

interface GeoRegion {
  code: string;
  name: string;
  flag: string;
  areas: GeoArea[];
}

interface RoleOption {
  id: number;
  name: string;
  description: string;
  disabled: boolean;
}

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const toggled = <T>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) {
    next.add(value);
  }
  return next;
};

/**
 * Map a user — the editor half of legacy's `CPS_User_Mapping.aspx`.
 *
 * Queue mode (CLAUDE.md §7): the accounts on the left, the one being mapped on the right,
 * and a summary of the pending changes beside it. Legacy picked a user from a dropdown and
 * then showed an **empty** form — it never loaded what the user already held — so an admin
 * re-ticked everything from the grids below, or silently removed it. Here the form opens on
 * what the user holds, and Save sends exactly what is ticked.
 *
 * **Areas are shown under their region.** Ticking a region reveals its areas; unticking it
 * takes them away, because an area without its region grants nothing. Held codes the
 * catalogue no longer contains stay visible, flagged, so they can be kept or removed rather
 * than silently dropped.
 *
 * The 540 accounts load once and filter in memory; the catalogue is cached for the session;
 * a mapping opened before opens instantly from memory and is re-read behind it.
 */
@Component({
  selector: 'to-admin2-mapping-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ScrollingModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    ConfirmDialogComponent,
    UserAccessPanelComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
  ],
  templateUrl: './mapping-editor.component.html',
  styleUrl: './mapping-editor.component.scss',
})
export class MappingEditorComponent {
  /** The account being mapped — the screen's `?user=` query parameter. */
  readonly userId = input<string | null>(null);
  /** Asks the screen to put another account in the URL. */
  readonly userSelected = output<string>();

  /**
   * Which facet of the account is shown. Mapping is legacy User Mapping (menuId 91); Menu access
   * is legacy Access Control (97), the user's Octane 2 screens. The screen passes only views
   * this admin holds.
   */
  readonly view = input<MappingView>('mapping');
  readonly canMap = input(true);
  readonly canAccess = input(false);
  readonly viewSelected = output<MappingView>();

  private readonly accessPanel = viewChild(UserAccessPanelComponent);

  private readonly api = inject(Admin2UserMappingApi);
  private readonly store = inject(UserMappingUsersStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = Array.from({ length: 9 }, (_, index) => index);
  /** Must match the row height in the stylesheet, or the virtual scroll drifts. */
  protected readonly userRowHeight = 54;
  protected readonly trackUser = (_: number, row: UserRow): string => row.user.userId;
  /** The access panel is created on first use and then kept, so it is not fetched twice. */
  protected readonly accessVisited = signal(false);

  // ─── Accounts ───────────────────────────────────────────────────────────────

  protected readonly usersLoading = computed(() => !this.store.loaded() && !this.store.failed());
  protected readonly usersFailed = computed(() => !this.store.loaded() && this.store.failed());

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
  protected readonly userFilter = signal<UserFilter>('all');

  private readonly userRows = computed<UserRow[]>(() =>
    this.store
      .rows()
      .map((user) => ({
        user,
        needsMapping:
          user.roleId === null ||
          int(user.businessTypeCount) === 0 ||
          int(user.regionCount) === 0 ||
          int(user.areaCount) === 0,
        haystack: `${user.userId}${user.fullName}${user.email}${user.roleName ?? ''}`.toLowerCase(),
      }))
      .sort((a, b) => COLLATOR.compare(a.user.fullName || a.user.userId, b.user.fullName || b.user.userId)),
  );

  protected readonly userCounts = computed(() => {
    const rows = this.userRows();
    return {
      all: rows.length,
      needs: rows.filter((row) => row.needsMapping).length,
      active: rows.filter((row) => row.user.isActive === true).length,
      inactive: rows.filter((row) => row.user.isActive !== true).length,
    } satisfies Record<UserFilter, number>;
  });

  protected readonly userFilters: { key: UserFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'needs', label: 'Needs mapping' },
    { key: 'active', label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
  ];

  protected readonly visibleUsers = computed(() => {
    const filter = this.userFilter();
    const term = this.search();
    return this.userRows().filter((row) => {
      if (filter === 'needs' && !row.needsMapping) {
        return false;
      }
      if (filter === 'active' && row.user.isActive !== true) {
        return false;
      }
      if (filter === 'inactive' && row.user.isActive === true) {
        return false;
      }
      return !term || row.haystack.includes(term);
    });
  });

  // ─── Catalogue ──────────────────────────────────────────────────────────────

  protected readonly catalogue = signal<UserMappingCatalogueResponse | null>(null);
  protected readonly catalogueFailed = signal(false);

  // ─── The mapping ────────────────────────────────────────────────────────────

  protected readonly saved = signal<UserMappingResponse | null>(null);
  protected readonly mappingLoading = signal(false);
  protected readonly mappingFailed = signal(false);
  private readonly cache = new Map<string, UserMappingResponse>();

  protected readonly roleControl = new FormControl<number | null>(null);
  private readonly roleId = toSignal(this.roleControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)), {
    initialValue: null,
  });
  protected readonly businessTypeIds = signal<ReadonlySet<number>>(new Set());
  protected readonly regionCodes = signal<ReadonlySet<string>>(new Set());
  protected readonly areaCodes = signal<ReadonlySet<string>>(new Set());

  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly confirmingRole = signal(false);

  private readonly savedDraft = computed<MappingDraft>(() => {
    const mapping = this.saved();
    return mapping ? draftFrom(mapping) : EMPTY_DRAFT;
  });

  private readonly draft = computed<MappingDraft>(() => ({
    roleId: this.roleId() ?? null,
    businessTypeIds: this.businessTypeIds(),
    regionCodes: this.regionCodes(),
    areaCodes: this.areaCodes(),
  }));

  protected readonly diff = computed(() => diffMapping(this.savedDraft(), this.draft()));
  protected readonly plan = computed<SavePlan>(() => planSave(this.savedDraft(), this.draft()));
  protected readonly dirty = computed(() => this.diff().count > 0);

  // ─── What the editor offers ─────────────────────────────────────────────────

  /** Active roles, plus the one the user holds even if it has been deactivated since. */
  protected readonly roleOptions = computed<RoleOption[]>(() => {
    const heldId = this.savedDraft().roleId;
    const options: RoleOption[] = (this.catalogue()?.roles ?? []).map((role) => ({
      id: int(role.roleId),
      name: role.isActive ? role.roleName : `${role.roleName} (inactive)`,
      description: role.roleDescription,
      disabled: !role.isActive && int(role.roleId) !== heldId,
    }));
    const held = this.saved()?.role;
    if (held && !options.some((option) => option.id === heldId)) {
      options.push({ id: int(held.roleId), name: held.roleName || `Role ${held.roleId} (unknown)`, description: '', disabled: false });
    }
    return options
      .filter((option) => !option.disabled || option.id === heldId)
      .sort((a, b) => COLLATOR.compare(a.name, b.name));
  });

  protected readonly selectedRole = computed(() => this.roleOptions().find((option) => option.id === this.roleId()) ?? null);

  protected readonly businessTypes = computed(() => {
    const options = (this.catalogue()?.businessTypes ?? []).map((type) => ({
      id: int(type.businessTypeId),
      name: type.name,
      flag: '',
    }));
    for (const held of this.saved()?.businessTypes ?? []) {
      const id = int(held.businessTypeId);
      if (!options.some((option) => option.id === id)) {
        options.push({ id, name: held.name || `Type ${id}`, flag: held.exists ? '' : 'No longer exists' });
      }
    }
    return options;
  });

  /**
   * Catalogue regions and their areas, plus anything the user holds that the catalogue no
   * longer offers — each under the region its code says it belongs to.
   */
  protected readonly geography = computed<GeoRegion[]>(() => {
    const regions = new Map<string, GeoRegion>();
    for (const region of this.catalogue()?.regions ?? []) {
      regions.set(region.code, {
        code: region.code,
        name: region.name || region.shortName || region.code,
        flag: '',
        areas: region.areas.map((area) => ({ code: area.code, name: area.name || area.shortName || area.code, flag: '' })),
      });
    }
    const mapping = this.saved();
    for (const held of mapping?.regions ?? []) {
      if (!regions.has(held.code)) {
        regions.set(held.code, {
          code: held.code,
          name: held.name || held.shortName || held.code,
          flag: held.exists ? 'Retired' : 'No longer exists',
          areas: [],
        });
      }
    }
    for (const held of mapping?.areas ?? []) {
      const regionCode = held.regionCode || regionOfArea(held.code);
      let region = regions.get(regionCode);
      if (!region) {
        region = { code: regionCode, name: regionCode, flag: 'No longer exists', areas: [] };
        regions.set(regionCode, region);
      }
      if (!region.areas.some((area) => area.code === held.code)) {
        region.areas.push({
          code: held.code,
          name: held.name || held.shortName || held.code,
          flag: held.exists ? (held.isActive ? '' : 'Retired') : 'No longer exists',
        });
      }
    }
    return [...regions.values()].sort((a, b) => Number(!!a.flag) - Number(!!b.flag) || COLLATOR.compare(a.name, b.name));
  });

  private readonly regionNames = computed(() => new Map(this.geography().map((region) => [region.code, region.name])));
  private readonly areaNames = computed(
    () => new Map(this.geography().flatMap((region) => region.areas.map((area) => [area.code, area.name] as const))),
  );

  /** Areas still ticked whose region is not — shown apart, because the API refuses them. */
  protected readonly outsideAreas = computed(() =>
    areasOutsideRegions(this.draft()).map((code) => ({ code, name: this.areaNames().get(code) ?? code })),
  );

  // ─── Summary ────────────────────────────────────────────────────────────────

  protected readonly summary = computed(() => {
    const diff = this.diff();
    const roleName = (id: number | null): string =>
      id === null ? 'No role' : (this.roleOptions().find((option) => option.id === id)?.name ?? `Role ${id}`);
    const typeName = (id: number): string => this.businessTypes().find((type) => type.id === id)?.name ?? `Type ${id}`;
    return {
      role: diff.roleChanged ? { from: roleName(diff.roleFrom), to: roleName(diff.roleTo) } : null,
      businessTypesAdded: diff.businessTypesAdded.map(typeName),
      businessTypesRemoved: diff.businessTypesRemoved.map(typeName),
      regionsAdded: diff.regionsAdded.map((code) => this.regionNames().get(code) ?? code),
      regionsRemoved: diff.regionsRemoved.map((code) => this.regionNames().get(code) ?? code),
      areasAdded: diff.areasAdded.map((code) => this.areaNames().get(code) ?? code),
      areasRemoved: diff.areasRemoved.map((code) => this.areaNames().get(code) ?? code),
    };
  });

  protected readonly changeGroups = computed(() => {
    const summary = this.summary();
    return [
      { label: 'Business types', added: summary.businessTypesAdded, removed: summary.businessTypesRemoved },
      { label: 'Regions', added: summary.regionsAdded, removed: summary.regionsRemoved },
      { label: 'Areas', added: summary.areasAdded, removed: summary.areasRemoved },
    ].filter((group) => group.added.length + group.removed.length > 0);
  });

  protected readonly roleChangeMessage = computed(() => {
    const role = this.summary().role;
    const name = this.saved()?.fullName || this.userId() || 'This account';
    if (!role) {
      return '';
    }
    const what = this.roleId() === null ? `lose the ${role.from} role` : `move from ${role.from} to ${role.to}`;
    return (
      `${name} will ${what}. Their Administration 2.0 menus and their place in claim approval routing ` +
      'change with it, for claims raised from now on.'
    );
  });

  constructor() {
    this.store.ensureFresh();

    effect(() => {
      if (this.view() === 'access') {
        untracked(() => this.accessVisited.set(true));
      }
    });
    this.loadCatalogue();

    effect(() => {
      const id = this.userId();
      untracked(() => {
        if (id) {
          this.openMapping(id);
        } else {
          this.saved.set(null);
          this.resetDraft(null);
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return (this.dirty() && !this.saving()) || (this.accessPanel()?.hasUnsavedChanges() ?? false);
  }

  /** The draft survives a switch — only the access panel's ticks are dropped by leaving it. */
  protected selectView(view: MappingView): void {
    if (view === this.view()) {
      return;
    }
    if (this.accessPanel()?.hasUnsavedChanges() && !confirm('You have unsaved access changes. Discard them?')) {
      return;
    }
    this.viewSelected.emit(view);
  }

  protected loadCatalogue(): void {
    this.catalogueFailed.set(false);
    this.api
      .catalogue()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogue) => this.catalogue.set(catalogue),
        error: () => this.catalogueFailed.set(true),
      });
  }

  protected retryUsers(): void {
    this.store.refresh();
  }

  // ─── Choosing an account ────────────────────────────────────────────────────

  protected choose(userId: string): void {
    if (userId === this.userId()) {
      return;
    }
    if (this.hasUnsavedChanges() && !confirm('You have unsaved changes to this account. Discard them?')) {
      return;
    }
    this.userSelected.emit(userId);
  }

  protected retryMapping(): void {
    const id = this.userId();
    if (id) {
      this.cache.delete(id);
      this.openMapping(id);
    }
  }

  /** From memory at once when opened before, then re-read — applied only while untouched. */
  private openMapping(userId: string): void {
    this.attempted.set(false);
    this.mappingFailed.set(false);
    const cached = this.cache.get(userId);
    if (cached) {
      this.saved.set(cached);
      this.resetDraft(cached);
    } else {
      this.saved.set(null);
      this.resetDraft(null);
      this.mappingLoading.set(true);
    }

    this.api
      .mapping(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mapping) => {
          if (this.userId() !== userId) {
            return;
          }
          this.mappingLoading.set(false);
          this.cache.set(userId, mapping);
          if (!cached || !this.dirty()) {
            this.saved.set(mapping);
            this.resetDraft(mapping);
          }
        },
        error: () => {
          if (this.userId() === userId) {
            this.mappingLoading.set(false);
            this.mappingFailed.set(!cached);
          }
        },
      });
  }

  protected resetDraft(mapping: UserMappingResponse | null = this.saved()): void {
    const draft = mapping ? draftFrom(mapping) : EMPTY_DRAFT;
    this.roleControl.setValue(draft.roleId);
    this.businessTypeIds.set(draft.businessTypeIds);
    this.regionCodes.set(draft.regionCodes);
    this.areaCodes.set(draft.areaCodes);
  }

  // ─── Editing ────────────────────────────────────────────────────────────────

  protected toggleBusinessType(id: number): void {
    this.businessTypeIds.update((set) => toggled(set, id));
  }

  /** Unticking a region takes its areas with it: an area without its region grants nothing. */
  protected toggleRegion(region: GeoRegion): void {
    const selecting = !this.regionCodes().has(region.code);
    this.regionCodes.update((set) => toggled(set, region.code));
    if (!selecting) {
      this.areaCodes.update((set) => new Set([...set].filter((code) => regionOfArea(code) !== region.code)));
    }
  }

  protected toggleArea(code: string): void {
    this.areaCodes.update((set) => toggled(set, code));
  }

  protected setAllAreas(region: GeoRegion, selected: boolean): void {
    this.areaCodes.update((set) => {
      const next = new Set(set);
      for (const area of region.areas) {
        if (selected) {
          next.add(area.code);
        } else {
          next.delete(area.code);
        }
      }
      return next;
    });
  }

  protected removeOutsideArea(code: string): void {
    this.areaCodes.update((set) => {
      const next = new Set(set);
      next.delete(code);
      return next;
    });
  }

  protected selectedAreaCount(region: GeoRegion): number {
    const selected = this.areaCodes();
    return region.areas.filter((area) => selected.has(area.code)).length;
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  protected submit(): void {
    this.attempted.set(true);
    const plan = this.plan();
    if (plan.kind === 'none' || plan.kind === 'blocked' || this.saving()) {
      return;
    }
    // A role change moves someone in approval routing — confirmed, with their names in it.
    if (this.diff().roleChanged && this.diff().roleFrom !== null) {
      this.confirmingRole.set(true);
      return;
    }
    this.execute();
  }

  protected confirmRoleChange(): void {
    this.confirmingRole.set(false);
    this.execute();
  }

  private execute(): void {
    const userId = this.userId();
    const plan = this.plan();
    if (!userId || plan.kind === 'none' || plan.kind === 'blocked') {
      return;
    }

    const write$: Observable<UserMappingWriteResponse> =
      plan.kind === 'replace'
        ? this.api.replace(userId, plan.request)
        : concat(...plan.steps.map((step) => this.removal(userId, step))).pipe(last());

    this.saving.set(true);
    write$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => {
        this.saving.set(false);
        this.applySaved(response);
      },
      error: () => {
        this.saving.set(false);
        // A run of removals may have stopped part-way. Re-read what actually holds now.
        if (plan.kind === 'removals') {
          this.cache.delete(userId);
          this.store.refresh();
          this.openMapping(userId);
        }
      },
    });
  }

  private removal(userId: string, step: RemovalStep): Observable<UserMappingWriteResponse> {
    switch (step.kind) {
      case 'role':
        return this.api.removeRole(userId, step.roleId);
      case 'businessType':
        return this.api.removeBusinessType(userId, step.businessTypeId);
      case 'region':
        return this.api.removeRegion(userId, step.regionCode);
      case 'area':
        return this.api.removeArea(userId, step.areaCode);
    }
  }

  private applySaved(response: UserMappingWriteResponse): void {
    const summary = this.summary();
    const name = response.mapping.fullName || response.userId;
    this.cache.set(response.userId, response.mapping);
    this.store.applyMapping(response.mapping);
    this.saved.set(response.mapping);
    this.resetDraft(response.mapping);
    this.attempted.set(false);

    const parts = [
      summary.role ? `role ${summary.role.from} → ${summary.role.to}` : '',
      this.changeCount('business type', summary.businessTypesAdded.length, summary.businessTypesRemoved.length),
      this.changeCount('region', summary.regionsAdded.length, summary.regionsRemoved.length),
      this.changeCount('area', summary.areasAdded.length, summary.areasRemoved.length),
    ].filter(Boolean);
    if (parts.length > 0) {
      this.notifications.success(`${name} saved: ${parts.join('; ')}.`);
    } else {
      this.notifications.info(`${name} already held exactly this. Nothing changed.`);
    }
  }

  private changeCount(noun: string, addedCount: number, removedCount: number): string {
    const parts = [
      addedCount > 0 ? `+${addedCount}` : '',
      removedCount > 0 ? `−${removedCount}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? `${parts.join(' ')} ${noun}${addedCount + removedCount === 1 ? '' : 's'}` : '';
  }
}
