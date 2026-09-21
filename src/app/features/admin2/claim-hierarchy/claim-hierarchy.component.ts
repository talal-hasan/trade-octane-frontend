import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, from, map, mergeMap } from 'rxjs';

import { ClaimHierarchyCatalogueResponse, ClaimHierarchyResponse } from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { Admin2ClaimHierarchiesApi } from '../services/admin2-claim-hierarchies.api';
import { Octane2RolesStore } from '../services/octane2-roles.store';
import {
  FINAL_APPROVAL_ROLE_ID,
  STEP_BACK_ROLE_ID,
  diffHierarchy,
  insertStep,
  moveStep,
  storedOrderIssues,
} from './claim-hierarchy.util';

interface RoleInfo {
  id: number;
  name: string;
  description: string;
}

/**
 * Claim Hierarchy — the order in which roles approve, per business type. Administration 2.0,
 * legacy `CPS_Claim_Hierarchy.aspx` (menuId 90, "Approval Hierarchy").
 *
 * Builder mode. Legacy dragged **every** role into order and saved them all, then deleted the
 * unwanted ones one by one — each delete leaving a gap. Here the order holds only the roles
 * that approve: drag a role in from the list, drag steps to reorder (or use the arrows), and
 * Save sends exactly that order in one transaction, numbered from 1.
 *
 * The order is read at every approval step, so a save reaches documents already in approval.
 * The summary says what will change before the click, including the two roles the claim
 * procedures depend on by id (RMC for step-back, role 7 for final approval).
 *
 * Seven business types, at most 17 steps and 34 roles: every hierarchy is fetched once in the
 * background, so switching business type is instant.
 */
@Component({
  selector: 'to-admin2-claim-hierarchy',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './claim-hierarchy.component.html',
  styleUrl: './claim-hierarchy.component.scss',
})
export class ClaimHierarchyComponent implements HasUnsavedChanges {
  /** `?businessType=<id>`, bound via `withComponentInputBinding()`. */
  readonly businessType = input<string | undefined>(undefined);

  private readonly api = inject(Admin2ClaimHierarchiesApi);
  private readonly rolesStore = inject(Octane2RolesStore);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = Array.from({ length: 7 }, (_, index) => index);
  protected readonly stepBackRoleId = STEP_BACK_ROLE_ID;
  protected readonly finalApprovalRoleId = FINAL_APPROVAL_ROLE_ID;

  // ─── Catalogue ──────────────────────────────────────────────────────────────

  protected readonly catalogue = signal<ClaimHierarchyCatalogueResponse | null>(null);
  protected readonly catalogueFailed = signal(false);

  protected readonly businessTypes = computed(() =>
    (this.catalogue()?.businessTypes ?? []).map((type) => ({
      id: int(type.businessTypeId),
      name: type.name || `Type ${type.businessTypeId}`,
    })),
  );

  private readonly roleById = computed(
    () =>
      new Map<number, RoleInfo>(
        (this.catalogue()?.roles ?? []).map((role) => [
          int(role.roleId),
          { id: int(role.roleId), name: role.name || `Role ${role.roleId}`, description: role.description },
        ]),
      ),
  );

  /** Known only once the role catalogue has loaded; until then the server decides. */
  private readonly inactiveRoleIds = computed(
    () => new Set(this.rolesStore.rows().filter((role) => !role.isActive).map((role) => int(role.roleId))),
  );

  protected readonly selectedId = computed(() => {
    const requested = Number(this.businessType());
    const types = this.businessTypes();
    return types.some((type) => type.id === requested) ? requested : (types[0]?.id ?? null);
  });

  protected readonly selectedName = computed(
    () => this.businessTypes().find((type) => type.id === this.selectedId())?.name ?? '',
  );

  // ─── Hierarchies ────────────────────────────────────────────────────────────

  private readonly hierarchies = signal<ReadonlyMap<number, ClaimHierarchyResponse>>(new Map());
  private readonly failedIds = signal<ReadonlySet<number>>(new Set());

  protected readonly saved = computed(() => {
    const id = this.selectedId();
    return id === null ? null : (this.hierarchies().get(id) ?? null);
  });

  protected readonly loadingSelected = computed(() => {
    const id = this.selectedId();
    return id !== null && !this.hierarchies().has(id) && !this.failedIds().has(id);
  });

  protected readonly failedSelected = computed(() => {
    const id = this.selectedId();
    return id !== null && !this.hierarchies().has(id) && this.failedIds().has(id);
  });

  private readonly savedIds = computed(() => (this.saved()?.levels ?? []).map((level) => int(level.roleId)));

  protected stepCount(businessTypeId: number): number | null {
    return this.hierarchies().get(businessTypeId)?.levels.length ?? null;
  }

  // ─── The draft ──────────────────────────────────────────────────────────────

  private readonly draft = signal<number[]>([]);
  /** The business type the draft was taken from; a draft for another one is ignored. */
  private readonly draftFor = signal<number | null>(null);

  protected readonly draftIds = computed(() =>
    this.draftFor() !== null && this.draftFor() === this.selectedId() ? this.draft() : this.savedIds(),
  );

  protected readonly steps = computed(() => {
    const saved = new Set(this.savedIds());
    const levels = new Map((this.saved()?.levels ?? []).map((level) => [int(level.roleId), level]));
    const roles = this.roleById();
    const inactive = this.inactiveRoleIds();
    return this.draftIds().map((roleId, index) => {
      const role = roles.get(roleId);
      const level = levels.get(roleId);
      return {
        roleId,
        position: index + 1,
        name: role?.name ?? (level?.roleName || `Role ${roleId}`),
        description: role?.description ?? level?.roleDescription ?? '',
        isNew: !saved.has(roleId),
        inactive: inactive.has(roleId),
      };
    });
  });

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

  /** Roles not in the order, by Role ID as legacy listed them; ones that cannot be added last. */
  protected readonly available = computed(() => {
    const inOrder = new Set(this.draftIds());
    const saved = new Set(this.savedIds());
    const inactive = this.inactiveRoleIds();
    const term = this.search();
    return [...this.roleById().values()]
      .filter((role) => !inOrder.has(role.id))
      .filter(
        (role) =>
          !term ||
          String(role.id) === term ||
          role.name.toLowerCase().includes(term) ||
          role.description.toLowerCase().includes(term),
      )
      .map((role) => ({ ...role, blocked: inactive.has(role.id) && !saved.has(role.id) }))
      .sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.id - b.id);
  });

  // ─── What Save will do ──────────────────────────────────────────────────────

  protected readonly diff = computed(() => diffHierarchy(this.savedIds(), this.draftIds()));
  protected readonly issues = computed(() => storedOrderIssues(this.saved()?.levels ?? []));
  protected readonly needsRenumber = computed(() => this.issues().ties.length > 0 || this.issues().gaps);

  protected readonly saving = signal(false);
  protected readonly confirmingClear = signal(false);

  protected readonly canSave = computed(
    () => !this.saving() && this.saved() !== null && (this.diff().changed || this.needsRenumber()),
  );

  protected readonly summary = computed(() => {
    const diff = this.diff();
    const name = (id: number): string => this.roleById().get(id)?.name ?? `Role ${id}`;
    const chain = (ids: readonly number[]): string => ids.map(name).join(' → ') || 'No steps';
    return {
      added: diff.added.map(name),
      removed: diff.removed.map(name),
      before: diff.reordered ? chain(this.savedIds()) : '',
      after: diff.reordered ? chain(this.draftIds()) : '',
    };
  });

  /** The two roles the claim procedures name by id, taken out of an order that had them. */
  protected readonly warnings = computed(() => {
    const removed = new Set(this.diff().removed);
    const type = this.selectedName();
    const name = (id: number): string => this.roleById().get(id)?.name ?? `Role ${id}`;
    const warnings: string[] = [];
    if (this.draftIds().length === 0 && this.savedIds().length > 0) {
      warnings.push(`This clears the ${type} hierarchy: its documents will have no approvers.`);
    }
    if (removed.has(STEP_BACK_ROLE_ID)) {
      warnings.push(`Without ${name(STEP_BACK_ROLE_ID)}, ${type} claims can no longer be stepped back to it.`);
    }
    if (removed.has(FINAL_APPROVAL_ROLE_ID)) {
      warnings.push(
        `Without ${name(FINAL_APPROVAL_ROLE_ID)}, ${type} claims are never marked approved — that happens when role ${FINAL_APPROVAL_ROLE_ID} approves.`,
      );
    }
    if (removed.size > 0) {
      warnings.push('Documents already waiting on a removed role are no longer handed to it.');
    }
    return warnings;
  });

  constructor() {
    this.rolesStore.ensureLoaded();
    this.loadCatalogue();

    effect(() => {
      const id = this.selectedId();
      untracked(() => {
        if (id !== null) {
          this.load(id);
        }
      });
    });

    // A fresh copy from the server becomes the draft only while nothing has been changed.
    effect(() => {
      const id = this.selectedId();
      const saved = this.saved();
      untracked(() => {
        if (id === null || !saved) {
          return;
        }
        if (this.draftFor() !== id || !this.diff().changed) {
          this.draft.set(saved.levels.map((level) => int(level.roleId)));
          this.draftFor.set(id);
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return this.diff().changed && !this.saving();
  }

  protected loadCatalogue(): void {
    this.catalogueFailed.set(false);
    this.api
      .catalogue()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogue) => {
          this.catalogue.set(catalogue);
          this.prefetch(catalogue);
        },
        error: () => this.catalogueFailed.set(true),
      });
  }

  /** Every other business type in the background, so switching never waits. */
  private prefetch(catalogue: ClaimHierarchyCatalogueResponse): void {
    const selected = this.selectedId();
    const others = catalogue.businessTypes.map((type) => int(type.businessTypeId)).filter((id) => id !== selected);
    from(others)
      .pipe(
        // One failure must not cancel the rest; that type simply loads when it is opened.
        mergeMap(
          (id) =>
            this.api.get(id).pipe(
              map((hierarchy) => ({ id, hierarchy })),
              catchError(() => EMPTY),
            ),
          3,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ id, hierarchy }) => this.store(id, hierarchy));
  }

  private load(id: number): void {
    this.api
      .get(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hierarchy) => this.store(id, hierarchy),
        error: () => this.failedIds.update((ids) => new Set(ids).add(id)),
      });
  }

  private store(id: number, hierarchy: ClaimHierarchyResponse): void {
    this.hierarchies.update((current) => new Map(current).set(id, hierarchy));
    this.failedIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  protected retrySelected(): void {
    const id = this.selectedId();
    if (id !== null) {
      this.failedIds.update((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      this.load(id);
    }
  }

  protected selectBusinessType(id: number): void {
    if (id === this.selectedId()) {
      return;
    }
    if (this.hasUnsavedChanges() && !confirm(`You have unsaved changes to the ${this.selectedName()} hierarchy. Discard them?`)) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { businessType: id },
      replaceUrl: true,
    });
  }

  // ─── Editing ────────────────────────────────────────────────────────────────

  private setDraft(ids: number[]): void {
    this.draft.set(ids);
    this.draftFor.set(this.selectedId());
  }

  protected dropOnOrder(event: CdkDragDrop<unknown, unknown, number>): void {
    if (event.previousContainer === event.container) {
      this.setDraft(moveStep(this.draftIds(), event.previousIndex, event.currentIndex));
    } else {
      this.setDraft(insertStep(this.draftIds(), event.item.data, event.currentIndex));
    }
  }

  /** Dragging a step back onto the role list takes it out of the order. */
  protected dropOnRoles(event: CdkDragDrop<unknown, unknown, number>): void {
    if (event.previousContainer !== event.container) {
      this.remove(event.item.data);
    }
  }

  protected add(roleId: number): void {
    this.setDraft(insertStep(this.draftIds(), roleId));
  }

  protected remove(roleId: number): void {
    this.setDraft(this.draftIds().filter((id) => id !== roleId));
  }

  protected move(index: number, offset: number): void {
    this.setDraft(moveStep(this.draftIds(), index, index + offset));
  }

  protected reset(): void {
    this.setDraft(this.savedIds());
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    if (this.draftIds().length === 0 && this.savedIds().length > 0) {
      this.confirmingClear.set(true);
      return;
    }
    this.execute();
  }

  protected confirmClear(): void {
    this.confirmingClear.set(false);
    this.execute();
  }

  private execute(): void {
    const id = this.selectedId();
    if (id === null) {
      return;
    }
    const type = this.selectedName();
    this.saving.set(true);
    this.api
      .replace(id, this.draftIds())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.store(id, response.hierarchy);
          this.setDraft(response.hierarchy.levels.map((level) => int(level.roleId)));
          // Each role's approval-step count on the Roles screen moves with this save.
          this.rolesStore.refresh();
          const steps = response.hierarchy.levels.length;
          if (response.changed) {
            this.notifications.success(
              `${type} approval order saved: ${steps} ${steps === 1 ? 'step' : 'steps'}. It applies to documents already in approval.`,
            );
          } else {
            this.notifications.info(`${type} already had this order. Nothing changed.`);
          }
        },
        // The interceptor raises the toast. Re-read, so a role deactivated meanwhile shows as such.
        error: () => {
          this.saving.set(false);
          this.load(id);
          this.rolesStore.refresh();
        },
      });
  }
}
