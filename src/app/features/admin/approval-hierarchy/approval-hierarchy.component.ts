import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { EMPTY, Subscription, catchError, debounceTime, distinctUntilChanged, from, map, mergeMap } from 'rxjs';

import { ApprovalHierarchyCatalogueResponse, ApprovalHierarchyResponse } from '../../../core/api/admin.models';
import { int } from '../../../core/api/api.types';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { AdminApprovalHierarchiesApi, ApprovalHierarchyScope } from '../services/admin-approval-hierarchies.api';
import {
  DEFAULT_GROUP_ID,
  addStep,
  diffSteps,
  joinWithPrevious,
  moveStep,
  removeRole,
  scopeKey,
  splitIntoOwnStep,
  stepsFromLevels,
} from './approval-hierarchy.util';

interface RoleInfo {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
}

interface Option {
  id: string;
  name: string;
}

/** How many scheme hierarchies are fetched at once in the background. */
const PREFETCH_CONCURRENCY = 4;

/**
 * Approval Hierarchy — who initiates and who approves, for one business type, group and
 * scheme key. Administration 1.0, legacy `Hierarchy.aspx` (menuId 135). Built on Claim
 * Hierarchy (Administration 2.0), with the two things the 1.0 table has that 2.0's does not:
 *
 *  - **Sequence 0 initiates.** Budget initiation offers a scheme group to the roles at
 *    sequence 0, and approval starts at 1. Three ACTIVITY hierarchies start at 1 instead —
 *    no role initiates — so the first sequence is kept, and shown, rather than assumed.
 *  - **Roles can share a step.** 14 hierarchies have one, 7 of them at sequence 0; any of
 *    the roles acts for it. So the order is a list of steps, each holding one or more roles:
 *    join a step with the one above, or split a role back out.
 *
 * Legacy saved every role in its grid and kept the first four. Here the order holds only the
 * roles that take part, and Save sends exactly those steps in one transaction.
 *
 * Fast by construction: the catalogue is cached for the session, and every scheme's
 * hierarchy for the chosen business type and group is fetched in the background, so
 * switching scheme never waits and each scheme chip shows its step count.
 */
@Component({
  selector: 'to-approval-hierarchy',
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
  templateUrl: './approval-hierarchy.component.html',
  styleUrl: './approval-hierarchy.component.scss',
})
export class ApprovalHierarchyComponent implements HasUnsavedChanges {
  /** `?businessType=&group=&scheme=`, bound via `withComponentInputBinding()`. */
  readonly businessType = input<string | undefined>(undefined);
  readonly group = input<string | undefined>(undefined);
  readonly scheme = input<string | undefined>(undefined);

  private readonly api = inject(AdminApprovalHierarchiesApi);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = Array.from({ length: 5 }, (_, index) => index);

  // ─── Catalogue ──────────────────────────────────────────────────────────────

  protected readonly catalogue = signal<ApprovalHierarchyCatalogueResponse | null>(null);
  protected readonly catalogueFailed = signal(false);

  protected readonly businessTypes = computed<Option[]>(() =>
    (this.catalogue()?.businessTypes ?? []).map((type) => ({
      id: String(int(type.businessTypeId)),
      name: type.name || `Type ${type.businessTypeId}`,
    })),
  );

  protected readonly groups = computed<Option[]>(() => uniqueOptions(this.catalogue()?.groups.map((g) => ({ id: g.groupId, name: g.name })) ?? []));

  /** One chip per key. Key B15 is listed as both DBDP and VTR-1, so its chip names both. */
  protected readonly schemes = computed<Option[]>(() => uniqueOptions(this.catalogue()?.schemes.map((s) => ({ id: s.schemeId, name: s.name })) ?? []));

  private readonly roleById = computed(
    () =>
      new Map<number, RoleInfo>(
        (this.catalogue()?.roles ?? []).map((role) => [
          int(role.roleId),
          {
            id: int(role.roleId),
            name: role.name || `Role ${role.roleId}`,
            description: role.description,
            isActive: role.isActive,
          },
        ]),
      ),
  );

  protected readonly businessTypeId = computed(() => pick(this.businessTypes(), this.businessType()));
  protected readonly groupId = computed(() => pick(this.groups(), this.group(), DEFAULT_GROUP_ID));
  protected readonly schemeId = computed(() => pick(this.schemes(), this.scheme()));

  protected readonly scope = computed<ApprovalHierarchyScope | null>(() => {
    const businessTypeId = this.businessTypeId();
    const groupId = this.groupId();
    const schemeId = this.schemeId();
    return businessTypeId === null || groupId === null || schemeId === null
      ? null
      : { businessTypeId: Number(businessTypeId), groupId, schemeId };
  });

  private readonly key = computed(() => {
    const scope = this.scope();
    return scope ? scopeKey(scope.businessTypeId, scope.groupId, scope.schemeId) : null;
  });

  protected readonly scopeLabel = computed(() => {
    const name = (options: Option[], id: string | null): string => options.find((option) => option.id === id)?.name ?? '';
    return {
      businessType: name(this.businessTypes(), this.businessTypeId()),
      group: name(this.groups(), this.groupId()),
      scheme: name(this.schemes(), this.schemeId()),
    };
  });

  // ─── Hierarchies ────────────────────────────────────────────────────────────

  private readonly hierarchies = signal<ReadonlyMap<string, ApprovalHierarchyResponse>>(new Map());
  private readonly failedKeys = signal<ReadonlySet<string>>(new Set());

  protected readonly saved = computed(() => {
    const key = this.key();
    return key === null ? null : (this.hierarchies().get(key) ?? null);
  });

  protected readonly loadingSelected = computed(() => {
    const key = this.key();
    return key !== null && !this.hierarchies().has(key) && !this.failedKeys().has(key);
  });

  protected readonly failedSelected = computed(() => {
    const key = this.key();
    return key !== null && !this.hierarchies().has(key) && this.failedKeys().has(key);
  });

  protected readonly stored = computed(() => stepsFromLevels(this.saved()?.levels ?? []));

  /** Steps in a scheme's hierarchy, once known — the count on its chip. Roles sharing a step count once. */
  protected stepCount(schemeId: string): number | null {
    const businessTypeId = this.businessTypeId();
    const groupId = this.groupId();
    if (businessTypeId === null || groupId === null) {
      return null;
    }
    const hierarchy = this.hierarchies().get(scopeKey(Number(businessTypeId), groupId, schemeId));
    return hierarchy ? new Set(hierarchy.levels.map((level) => int(level.sequence))).size : null;
  }

  // ─── The draft ──────────────────────────────────────────────────────────────

  private readonly draft = signal<number[][]>([]);
  private readonly draftFirst = signal<0 | 1>(0);
  /** The hierarchy the draft was taken from; a draft for another one is ignored. */
  private readonly draftFor = signal<string | null>(null);

  private readonly draftActive = computed(() => this.draftFor() !== null && this.draftFor() === this.key());

  protected readonly draftSteps = computed(() => (this.draftActive() ? this.draft() : this.stored().steps));
  protected readonly firstSequence = computed<0 | 1>(() =>
    this.draftActive() ? this.draftFirst() : this.stored().firstSequence,
  );

  protected readonly steps = computed(() => {
    const savedRoles = new Set(this.stored().steps.flat());
    const levels = new Map((this.saved()?.levels ?? []).map((level) => [int(level.roleId), level]));
    const roles = this.roleById();
    const first = this.firstSequence();
    return this.draftSteps().map((roleIds, index) => ({
      index,
      sequence: first + index,
      initiates: first + index === 0,
      key: roleIds.join('+'),
      roles: roleIds.map((roleId) => {
        const role = roles.get(roleId);
        const level = levels.get(roleId);
        return {
          id: roleId,
          name: role?.name ?? (level?.roleName || `Role ${roleId}`),
          description: role?.description ?? level?.roleDescription ?? '',
          isNew: !savedRoles.has(roleId),
          inactive: role ? !role.isActive : level?.roleIsActive === false,
        };
      }),
    }));
  });

  protected readonly roleTotal = computed(() => this.draftSteps().reduce((total, roles) => total + roles.length, 0));

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

  /** Roles not in the hierarchy, by Role ID as legacy listed them; ones that cannot be added last. */
  protected readonly available = computed(() => {
    const inHierarchy = new Set(this.draftSteps().flat());
    const saved = new Set(this.stored().steps.flat());
    const term = this.search();
    return [...this.roleById().values()]
      .filter((role) => !inHierarchy.has(role.id))
      .filter(
        (role) =>
          !term ||
          String(role.id) === term ||
          role.name.toLowerCase().includes(term) ||
          role.description.toLowerCase().includes(term),
      )
      .map((role) => ({ ...role, blocked: !role.isActive && !saved.has(role.id) }))
      .sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.id - b.id);
  });

  // ─── What Save will do ──────────────────────────────────────────────────────

  protected readonly diff = computed(() => diffSteps(this.stored().steps, this.draftSteps()));
  protected readonly firstChanged = computed(
    () => this.draftSteps().length > 0 && this.firstSequence() !== this.stored().firstSequence,
  );
  protected readonly changed = computed(() => this.diff().changed || this.firstChanged());
  protected readonly needsRenumber = computed(() => this.stored().irregular);

  protected readonly saving = signal(false);
  protected readonly confirmingClear = signal(false);

  protected readonly canSave = computed(
    () => !this.saving() && this.saved() !== null && (this.changed() || this.needsRenumber()),
  );

  private roleName(id: number): string {
    return this.roleById().get(id)?.name ?? `Role ${id}`;
  }

  /** `RMC → SOO / RTME → RSM`: steps in order, roles sharing a step joined by a slash. */
  protected chain(steps: readonly (readonly number[])[]): string {
    return steps.map((roles) => roles.map((id) => this.roleName(id)).join(' / ')).join(' → ') || 'No steps';
  }

  protected readonly summary = computed(() => {
    const diff = this.diff();
    const orderChanged = diff.moved.length > 0 || (diff.changed && diff.added.length === 0 && diff.removed.length === 0);
    return {
      added: diff.added.map((id) => this.roleName(id)),
      removed: diff.removed.map((id) => this.roleName(id)),
      before: orderChanged ? this.chain(this.stored().steps) : '',
      after: orderChanged ? this.chain(this.draftSteps()) : '',
    };
  });

  protected readonly warnings = computed(() => {
    const warnings: string[] = [];
    const { scheme, group } = this.scopeLabel();
    const steps = this.draftSteps();
    if (steps.length === 0 && this.stored().steps.length > 0) {
      warnings.push(`This clears the ${scheme} ${group} hierarchy: nobody initiates or approves it.`);
      return warnings;
    }
    if (this.firstChanged()) {
      warnings.push(
        this.firstSequence() === 0
          ? `${this.chain(steps.slice(0, 1))} will initiate instead of approving, and every later step moves one approval earlier.`
          : `No role will initiate ${scheme} ${group}: ${this.chain(steps.slice(0, 1))} becomes the first approver.`,
      );
    } else if (this.firstSequence() === 0 && this.diff().changed && !this.sameRoles(steps[0], this.stored().steps[0])) {
      warnings.push(`The initiating roles change to ${this.chain(steps.slice(0, 1))}.`);
    }
    if (this.diff().removed.length > 0) {
      warnings.push('A document already waiting on someone stays with them; the change applies from its next step.');
    }
    return warnings;
  });

  private sameRoles(a: readonly number[] | undefined, b: readonly number[] | undefined): boolean {
    const left = a ?? [];
    const right = b ?? [];
    return left.length === right.length && left.every((id) => right.includes(id));
  }

  private prefetch$: Subscription | null = null;

  constructor() {
    this.loadCatalogue();

    effect(() => {
      const scope = this.scope();
      untracked(() => {
        if (scope) {
          this.load(scope);
        }
      });
    });

    // Every scheme under the chosen business type and group, in the background.
    effect(() => {
      const businessTypeId = this.businessTypeId();
      const groupId = this.groupId();
      const schemes = this.schemes();
      untracked(() => {
        if (businessTypeId !== null && groupId !== null) {
          this.prefetch(Number(businessTypeId), groupId, schemes);
        }
      });
    });

    // A fresh copy from the server becomes the draft only while nothing has been changed.
    effect(() => {
      const key = this.key();
      const saved = this.saved();
      untracked(() => {
        if (key === null || !saved) {
          return;
        }
        if (this.draftFor() !== key || !this.changed()) {
          const stored = stepsFromLevels(saved.levels);
          this.draft.set(stored.steps);
          this.draftFirst.set(stored.firstSequence);
          this.draftFor.set(key);
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return this.changed() && !this.saving();
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

  private prefetch(businessTypeId: number, groupId: string, schemes: readonly Option[]): void {
    this.prefetch$?.unsubscribe();
    const selected = this.schemeId();
    const pending = schemes
      .map((scheme) => scheme.id)
      .filter((id) => id !== selected && !this.hierarchies().has(scopeKey(businessTypeId, groupId, id)));
    this.prefetch$ = from(pending)
      .pipe(
        // One failure must not cancel the rest; that scheme simply loads when it is opened.
        mergeMap(
          (schemeId) =>
            this.api.get({ businessTypeId, groupId, schemeId }).pipe(
              map((hierarchy) => ({ schemeId, hierarchy })),
              catchError(() => EMPTY),
            ),
          PREFETCH_CONCURRENCY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ schemeId, hierarchy }) => this.store(scopeKey(businessTypeId, groupId, schemeId), hierarchy));
  }

  private load(scope: ApprovalHierarchyScope): void {
    const key = scopeKey(scope.businessTypeId, scope.groupId, scope.schemeId);
    if (this.hierarchies().has(key)) {
      return;
    }
    this.api
      .get(scope)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hierarchy) => this.store(key, hierarchy),
        error: () => this.failedKeys.update((keys) => new Set(keys).add(key)),
      });
  }

  private store(key: string, hierarchy: ApprovalHierarchyResponse): void {
    this.hierarchies.update((current) => new Map(current).set(key, hierarchy));
    this.failedKeys.update((keys) => {
      const next = new Set(keys);
      next.delete(key);
      return next;
    });
  }

  protected retrySelected(): void {
    const scope = this.scope();
    const key = this.key();
    if (scope && key) {
      this.failedKeys.update((keys) => {
        const next = new Set(keys);
        next.delete(key);
        return next;
      });
      this.load(scope);
    }
  }

  protected select(param: 'businessType' | 'group' | 'scheme', id: string): void {
    const current = param === 'businessType' ? this.businessTypeId() : param === 'group' ? this.groupId() : this.schemeId();
    if (id === current) {
      return;
    }
    const { scheme, group } = this.scopeLabel();
    if (this.hasUnsavedChanges() && !confirm(`You have unsaved changes to the ${scheme} ${group} hierarchy. Discard them?`)) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { [param]: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  // ─── Editing ────────────────────────────────────────────────────────────────

  private setDraft(steps: number[][], first: 0 | 1 = this.firstSequence()): void {
    this.draft.set(steps);
    this.draftFirst.set(first);
    this.draftFor.set(this.key());
  }

  protected dropOnOrder(event: CdkDragDrop<unknown, unknown, number>): void {
    if (event.previousContainer === event.container) {
      this.setDraft(moveStep(this.draftSteps(), event.previousIndex, event.currentIndex));
    } else {
      this.setDraft(addStep(this.draftSteps(), event.item.data, event.currentIndex));
    }
  }

  /** Dragging a single-role step back onto the role list takes it out of the hierarchy. */
  protected dropOnRoles(event: CdkDragDrop<unknown, unknown, number>): void {
    if (event.previousContainer !== event.container) {
      const step = this.draftSteps()[event.previousIndex] ?? [];
      this.setDraft(step.reduce((steps, roleId) => removeRole(steps, roleId), this.draftSteps()));
    }
  }

  protected add(roleId: number): void {
    this.setDraft(addStep(this.draftSteps(), roleId));
  }

  protected remove(roleId: number): void {
    this.setDraft(removeRole(this.draftSteps(), roleId));
  }

  protected move(index: number, offset: number): void {
    this.setDraft(moveStep(this.draftSteps(), index, index + offset));
  }

  protected join(index: number): void {
    this.setDraft(joinWithPrevious(this.draftSteps(), index));
  }

  protected split(roleId: number): void {
    this.setDraft(splitIntoOwnStep(this.draftSteps(), roleId));
  }

  protected setFirstSequence(first: 0 | 1): void {
    this.setDraft(this.draftSteps(), first);
  }

  protected reset(): void {
    this.setDraft(this.stored().steps, this.stored().firstSequence);
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  protected save(): void {
    if (!this.canSave()) {
      return;
    }
    if (this.draftSteps().length === 0 && this.stored().steps.length > 0) {
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
    const scope = this.scope();
    const key = this.key();
    if (!scope || !key) {
      return;
    }
    const { scheme, group } = this.scopeLabel();
    this.saving.set(true);
    this.api
      .replace(scope, { steps: this.draftSteps().map((roles) => [...roles]), firstSequence: this.firstSequence() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.store(key, response.hierarchy);
          const stored = stepsFromLevels(response.hierarchy.levels);
          this.setDraft(stored.steps, stored.firstSequence);
          const count = stored.steps.length;
          if (response.changed) {
            this.notifications.success(`${scheme} ${group} hierarchy saved: ${count} ${count === 1 ? 'step' : 'steps'}.`);
          } else {
            this.notifications.info(`${scheme} ${group} already had these steps. Nothing changed.`);
          }
        },
        // The interceptor raises the toast. Re-read, so the screen shows what is stored.
        error: () => {
          this.saving.set(false);
          this.hierarchies.update((current) => {
            const next = new Map(current);
            next.delete(key);
            return next;
          });
          this.load(scope);
        },
      });
  }
}

/** First of each id; names of repeated ids joined — key B15 is both DBDP and VTR-1. */
function uniqueOptions(options: readonly Option[]): Option[] {
  const byId = new Map<string, string[]>();
  for (const option of options) {
    const names = byId.get(option.id) ?? [];
    const name = option.name || option.id;
    if (!names.includes(name)) {
      names.push(name);
    }
    byId.set(option.id, names);
  }
  return [...byId.entries()].map(([id, names]) => ({ id, name: names.join(' / ') }));
}

/** The requested id if it exists, else the preferred one, else the first. */
function pick(options: readonly Option[], requested: string | undefined, preferred?: string): string | null {
  if (requested && options.some((option) => option.id === requested)) {
    return requested;
  }
  if (preferred && options.some((option) => option.id === preferred)) {
    return preferred;
  }
  return options[0]?.id ?? null;
}
