import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { map } from 'rxjs';

import { Octane2RoleResponse, Octane2RoleWriteRequest } from '../../../../core/api/admin2.models';
import { int } from '../../../../core/api/api.types';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { normaliseName, uniqueNameValidator } from '../../../../shared/validators/unique-name.validator';
import { Admin2RolesApi } from '../../services/admin2-roles.api';
import { Octane2RolesStore } from '../../services/octane2-roles.store';
import {
  ROLE_FIELD_LABELS,
  ROLE_FLAGS,
  ROLE_TEXT_MAX,
  ROLE_TEXT_PATTERN,
  ROLES_2_ROUTE,
  ROLES_2_TAB_ACCESS,
  plural,
  roleLabel,
} from '../role.util';

interface PendingChange {
  label: string;
  from: string;
  to: string;
}

/** Built-in `required` accepts "   "; the server trims and calls that missing. */
const NOT_BLANK = Validators.pattern(/\S/);

const onOff = (value: boolean): string => (value ? 'On' : 'Off');

/**
 * Create or edit an Administration 2.0 role — the form half of legacy's `CPS_Role.aspx`.
 *
 * Builder mode (CLAUDE.md §7): six fields, and a summary beside them saying what will be
 * saved and — on edit — who it reaches.
 *
 * What changed from legacy:
 *
 * - **Edit keeps every flag.** Legacy's Edit button loaded two of the four flags, so every
 *   update silently switched "Can Update Amount" and "Is Read Detail" off. The form loads
 *   and sends all four; the API requires them.
 * - **A taken name is caught as it is typed**, against every role, inactive ones included,
 *   ignoring case and surrounding spaces — the server's rule. Legacy checked on create only,
 *   and never on rename.
 * - **Each flag says what it does.** Two of the four are read by nothing today, and the form
 *   says so rather than letting an admin believe they changed something.
 */
@Component({
  selector: 'to-admin2-role-form',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
  ],
  templateUrl: './role-form.component.html',
  styleUrl: './role-form.component.scss',
})
export class Admin2RoleFormComponent implements HasUnsavedChanges {
  /** Route param. Absent on create. Bound via `withComponentInputBinding()`. */
  readonly roleId = input<string | undefined>(undefined);

  private readonly api = inject(Admin2RolesApi);
  private readonly store = inject(Octane2RolesStore);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly menuAccess = inject(MenuAccessService);

  protected readonly icons = ICON_REGISTRY;
  protected readonly canEditAccess = computed(() => this.menuAccess.tabsFor(ROLES_2_ROUTE).includes(ROLES_2_TAB_ACCESS));
  protected readonly flags = ROLE_FLAGS;
  protected readonly route = ROLES_2_ROUTE;
  protected readonly textMax = ROLE_TEXT_MAX;
  protected readonly plural = plural;

  private readonly id = computed(() => {
    const value = Number(this.roleId());
    return Number.isInteger(value) && value > 0 ? value : null;
  });
  protected readonly isEdit = computed(() => this.roleId() !== undefined);

  protected readonly role = signal<Octane2RoleResponse | null>(null);
  protected readonly roleLoading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    roleName: [
      '',
      [
        Validators.required,
        NOT_BLANK,
        Validators.maxLength(ROLE_TEXT_MAX),
        Validators.pattern(ROLE_TEXT_PATTERN),
        uniqueNameValidator((name) => this.ownerOfName(name)),
      ],
    ],
    roleDescription: [
      '',
      [Validators.required, NOT_BLANK, Validators.maxLength(ROLE_TEXT_MAX), Validators.pattern(ROLE_TEXT_PATTERN)],
    ],
    allowWbsSp: [false],
    wbsSpVisibility: [false],
    canUpdateAmount: [false],
    isReadDetail: [false],
  });

  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  protected readonly enabledFlags = computed(() => {
    const value = this.value();
    return ROLE_FLAGS.filter((flag) => value[flag.key]);
  });

  /** On edit: what Save will change, against the role as loaded. */
  protected readonly changes = computed<PendingChange[]>(() => {
    const stored = this.role();
    if (!stored) {
      return [];
    }
    const value = this.value();
    const out: PendingChange[] = [];
    const name = value.roleName.trim();
    const description = value.roleDescription.trim();
    if (name !== stored.roleName) {
      out.push({ label: ROLE_FIELD_LABELS['roleName'], from: stored.roleName, to: name || '—' });
    }
    if (description !== stored.roleDescription) {
      out.push({ label: ROLE_FIELD_LABELS['roleDescription'], from: stored.roleDescription || '—', to: description || '—' });
    }
    for (const flag of ROLE_FLAGS) {
      if (value[flag.key] !== stored[flag.key]) {
        out.push({ label: flag.shortLabel, from: onOff(stored[flag.key]), to: onOff(value[flag.key]) });
      }
    }
    return out;
  });

  protected readonly invalidCount = computed(() => {
    this.status();
    this.value();
    return Object.values(this.form.controls).filter((control) => control.invalid).length;
  });

  protected readonly canSave = computed(
    () => !this.saving() && (!this.isEdit() || (this.role() !== null && this.changes().length > 0)),
  );

  /** On edit, the reach of this role — what every change made here lands on. */
  protected readonly reach = computed(() => {
    const role = this.role();
    if (!role) {
      return null;
    }
    return {
      users: int(role.userCount),
      activeUsers: int(role.activeUserCount),
      menus: int(role.menuGrantCount),
      steps: int(role.approvalHierarchyLevelCount),
      levels: int(role.authorityLevelCount),
    };
  });

  protected readonly renaming = computed(() => this.changes().some((change) => change.label === ROLE_FIELD_LABELS['roleName']));

  constructor() {
    // The duplicate-name check needs the catalogue, including when this form is opened
    // directly rather than from the list.
    this.store.ensureLoaded();

    // Re-run the name check once the catalogue arrives or changes under a name already typed.
    effect(() => {
      this.store.rows();
      untracked(() => this.form.controls.roleName.updateValueAndValidity());
    });

    effect(() => {
      const isEdit = this.isEdit();
      const id = this.id();
      untracked(() => {
        if (!isEdit) {
          return;
        }
        if (id === null) {
          this.notFound.set(true);
        } else {
          this.loadRole(id);
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  /** Who already holds a name, other than the role being edited. */
  private ownerOfName(normalised: string): string | null {
    const self = this.id();
    const owner = this.store
      .rows()
      .find((role) => int(role.roleId) !== self && normaliseName(role.roleName) === normalised);
    return owner ? roleLabel(owner) : null;
  }

  /**
   * Opens instantly from the list's copy of the role, then re-reads it. The fresh copy is
   * applied only while the form is untouched, so it never overwrites what the admin typed.
   */
  private loadRole(roleId: number): void {
    const cached = this.store.byKey(roleId);
    if (cached) {
      this.applyRole(cached);
    } else {
      this.roleLoading.set(true);
    }

    this.api
      .get(roleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.roleLoading.set(false);
          this.store.upsert(fresh);
          if (!cached || this.form.pristine) {
            this.applyRole(fresh);
          }
        },
        error: (error: unknown) => {
          this.roleLoading.set(false);
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
          }
        },
      });
  }

  private applyRole(role: Octane2RoleResponse): void {
    this.role.set(role);
    this.form.reset({
      roleName: role.roleName,
      roleDescription: role.roleDescription,
      allowWbsSp: role.allowWbsSp,
      wbsSpVisibility: role.wbsSpVisibility,
      canUpdateAmount: role.canUpdateAmount,
      isReadDetail: role.isReadDetail,
    });
  }

  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.attempted());
  }

  protected textError(control: AbstractControl, what: string): string {
    // Blank-but-for-spaces fails NOT_BLANK, which reports as a pattern error.
    if (control.hasError('required') || (control.hasError('pattern') && !String(control.value).trim())) {
      return `${what} is required.`;
    }
    if (control.hasError('maxlength')) {
      return `Use at most ${ROLE_TEXT_MAX} characters.`;
    }
    if (control.hasError('nameTaken')) {
      return `Already taken by ${(control.getError('nameTaken') as { owner: string }).owner}.`;
    }
    return 'Use letters, digits, spaces and underscores only.';
  }

  protected submit(): void {
    this.attempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.canSave()) {
      return;
    }

    const value = this.form.getRawValue();
    const request: Octane2RoleWriteRequest = {
      ...value,
      roleName: value.roleName.trim(),
      roleDescription: value.roleDescription.trim(),
    };

    this.saving.set(true);
    const id = this.id();

    if (this.isEdit() && id !== null) {
      this.api
        .update(id, request)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.store.upsert(response.role);
            const changed = response.changedFields.map((field) => ROLE_FIELD_LABELS[field] ?? field);
            if (changed.length > 0) {
              this.notifications.success(`${roleLabel(response.role)} saved. Updated: ${changed.join(', ')}.`);
            } else {
              this.notifications.info(`${roleLabel(response.role)} already had these values. Nothing changed.`);
            }
            this.leave(int(response.role.roleId));
          },
          error: (error: unknown) => this.onWriteError(error),
        });
      return;
    }

    this.api
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.store.upsert(created);
          // A new role opens nothing until it is given screens, so that is the next step.
          if (this.canEditAccess()) {
            this.notifications.success(`${roleLabel(created)} created. Now choose the screens it opens.`);
            this.form.markAsPristine();
            this.saving.set(false);
            void this.router.navigate([ROLES_2_ROUTE, int(created.roleId), 'access']);
          } else {
            this.notifications.success(`${roleLabel(created)} created. It opens no screens until it is given menu access.`);
            this.leave(int(created.roleId));
          }
        },
        error: (error: unknown) => this.onWriteError(error),
      });
  }

  /** A conflict means the catalogue moved under the form: reload it, so the name check sees why. */
  private onWriteError(error: unknown): void {
    this.saving.set(false);
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.store.refresh();
    }
  }

  /** Back to the grid, which brings the saved role into view and marks it. */
  private leave(roleId: number): void {
    this.form.markAsPristine();
    this.saving.set(false);
    void this.router.navigate([ROLES_2_ROUTE], { queryParams: { saved: roleId } });
  }
}
