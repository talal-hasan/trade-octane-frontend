import {
  Component,
  DestroyRef,
  Signal,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';

import {
  LevelOfAuthorityCatalogueResponse,
  LevelOfAuthorityResponse,
  LevelOfAuthorityWriteRequest,
} from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { PkrCurrencyPipe } from '../../../shared/pipes/pkr-currency.pipe';
import { numberRangeValidator } from '../../../shared/validators/number-range.validator';
import { uniqueCombinationValidator } from '../../../shared/validators/unique-combination.validator';
import { Admin2LevelOfAuthoritiesApi } from '../services/admin2-level-of-authorities.api';
import { LevelOfAuthoritiesStore } from '../services/level-of-authorities.store';
import { Octane2RolesStore } from '../services/octane2-roles.store';
import {
  LEVEL_OF_AUTHORITY_FIELD_LABELS,
  MAX_AMOUNT,
  joinsApprovalCycle,
} from './level-of-authority.util';

interface Option {
  id: number;
  name: string;
}

interface RoleOption extends Option {
  /** Why it cannot be picked, or empty. */
  blockedReason: string;
  disabled: boolean;
}

/** A level of authority with its wire integers read once. */
interface Band {
  row: LevelOfAuthorityResponse;
  id: number;
  businessTypeId: number;
  claimNatureId: number;
  roleId: number;
  from: number;
  to: number;
}

interface PendingChange {
  label: string;
  from: string;
  to: string;
}

type PanelMode = { kind: 'try' } | { kind: 'new' } | { kind: 'edit'; id: number };

function toBand(row: LevelOfAuthorityResponse): Band {
  return {
    row,
    id: int(row.levelOfAuthorityId),
    businessTypeId: int(row.businessTypeId),
    claimNatureId: int(row.claimNatureId),
    roleId: int(row.roleId),
    from: int(row.fromAmount),
    to: int(row.toAmount),
  };
}

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const PKR = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 0 });
const pkr = (value: number): string => `PKR ${PKR.format(value)}`;

/**
 * Level Of Authorities — who is brought into a claim's approval, by business type, claim
 * nature and claim amount. Legacy `CPS_Level_Of_Authorities.aspx`, Administration 2.0.
 *
 * **One screen, not a list and a form route**, unlike Distributors and Roles. A band only
 * makes sense next to its neighbours: setting GM's "from" amount is a decision about where
 * Director's starts. So the pair's roles stay on screen while one is edited, in the panel
 * beside them — the same reasoning as Scheme Frequency's in-place editing.
 *
 * **The rule is shown, not assumed.** `Proc_Claim_Create` brings a role in when the claim
 * amount is between From and To, *or above To*, or both are 0 — so a role joins every claim
 * from its From amount upwards, and To never keeps it out. Most people read a band as a
 * range that stops. The panel's "Try a claim amount" applies the procedure's own test, so an
 * admin sees exactly who a claim reaches before changing anything.
 *
 * All 63 rows load once; switching business type or claim nature never waits on the server.
 */
@Component({
  selector: 'to-admin2-level-of-authorities',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputNumberModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    PkrCurrencyPipe,
  ],
  templateUrl: './level-of-authorities.component.html',
  styleUrl: './level-of-authorities.component.scss',
})
export class LevelOfAuthoritiesComponent implements HasUnsavedChanges {
  private readonly api = inject(Admin2LevelOfAuthoritiesApi);
  private readonly store = inject(LevelOfAuthoritiesStore);
  private readonly rolesStore = inject(Octane2RolesStore);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly maxAmount = MAX_AMOUNT;
  protected readonly skeletonRows = Array.from({ length: 7 }, (_, index) => index);

  protected readonly catalogue = signal<LevelOfAuthorityCatalogueResponse | null>(null);
  protected readonly catalogueFailed = signal(false);

  protected readonly loading = computed(
    () => (!this.store.loaded() && !this.store.failed()) || (!this.catalogue() && !this.catalogueFailed()),
  );
  protected readonly failed = computed(
    () => (!this.store.loaded() && this.store.failed()) || (!this.catalogue() && this.catalogueFailed()),
  );
  protected readonly refreshing = this.store.refreshing;

  protected readonly panel = signal<PanelMode>({ kind: 'try' });
  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly highlightId = signal<number | null>(null);

  // ─── Catalogue ──────────────────────────────────────────────────────────────

  protected readonly businessTypes = computed<Option[]>(() =>
    (this.catalogue()?.businessTypes ?? []).map((option) => ({ id: int(option.id), name: option.name || `Type ${option.id}` })),
  );

  protected readonly claimNatures = computed<Option[]>(() =>
    (this.catalogue()?.claimNatures ?? []).map((option) => ({ id: int(option.id), name: option.name || `Nature ${option.id}` })),
  );

  private readonly roleNames = computed(
    () => new Map((this.catalogue()?.roles ?? []).map((option) => [int(option.id), option.name])),
  );

  /** Only a loaded role catalogue can say a role is inactive; until then, the server decides. */
  private readonly inactiveRoleIds = computed(
    () => new Set(this.rolesStore.rows().filter((role) => !role.isActive).map((role) => int(role.roleId))),
  );

  private readonly bands = computed(() => this.store.rows().map(toBand));

  // ─── Selected pair ──────────────────────────────────────────────────────────

  private readonly fallbackPair = computed(() => {
    const withRows = this.bands()[0];
    return {
      businessTypeId: withRows?.businessTypeId ?? this.businessTypes()[0]?.id ?? 0,
      claimNatureId: withRows?.claimNatureId ?? this.claimNatures()[0]?.id ?? 0,
    };
  });

  protected readonly businessTypeId = computed(
    () => this.store.selectedPair()?.businessTypeId ?? this.fallbackPair().businessTypeId,
  );
  protected readonly claimNatureId = computed(
    () => this.store.selectedPair()?.claimNatureId ?? this.fallbackPair().claimNatureId,
  );

  protected readonly businessTypeName = computed(() => this.nameIn(this.businessTypes(), this.businessTypeId()));
  protected readonly claimNatureName = computed(() => this.nameIn(this.claimNatures(), this.claimNatureId()));

  protected readonly countByBusinessType = computed(() => {
    const counts = new Map<number, number>();
    for (const band of this.bands()) {
      counts.set(band.businessTypeId, (counts.get(band.businessTypeId) ?? 0) + 1);
    }
    return counts;
  });

  protected readonly countByClaimNature = computed(() => {
    const counts = new Map<number, number>();
    for (const band of this.bands()) {
      if (band.businessTypeId === this.businessTypeId()) {
        counts.set(band.claimNatureId, (counts.get(band.claimNatureId) ?? 0) + 1);
      }
    }
    return counts;
  });

  /** The pair's bands, lowest threshold first — the order a growing claim picks roles up in. */
  protected readonly pairBands = computed(() =>
    this.bands()
      .filter((band) => band.businessTypeId === this.businessTypeId() && band.claimNatureId === this.claimNatureId())
      .sort((a, b) => a.from - b.from || a.to - b.to || COLLATOR.compare(a.row.roleName, b.row.roleName)),
  );

  // ─── Try a claim amount ─────────────────────────────────────────────────────

  protected readonly amountControl = new FormControl<number | null>(null);
  private readonly amount = toSignal(this.amountControl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)), {
    initialValue: null,
  });

  protected readonly trial = computed(() => {
    const amount = this.amount();
    if (amount === null || amount === undefined) {
      return null;
    }
    const bands = this.pairBands().map((band) => ({ band, joins: joinsApprovalCycle(amount, band.from, band.to) }));
    return { amount, bands, joining: bands.filter((entry) => entry.joins).length };
  });

  // ─── Form ───────────────────────────────────────────────────────────────────

  protected readonly form = this.fb.nonNullable.group(
    {
      businessTypeId: [0, [Validators.min(1)]],
      claimNatureId: [0, [Validators.min(1)]],
      roleId: [0, [Validators.min(1)]],
      fromAmount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(MAX_AMOUNT)]),
      toAmount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(MAX_AMOUNT)]),
    },
    {
      validators: [
        numberRangeValidator('fromAmount', 'toAmount'),
        uniqueCombinationValidator((group) => this.duplicateOf(group)),
      ],
    },
  );

  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  protected readonly editing: Signal<Band | null> = computed(() => {
    const mode = this.panel();
    return mode.kind === 'edit' ? (this.bands().find((band) => band.id === mode.id) ?? null) : null;
  });

  /**
   * Roles for the form's pair. A role that already has a level there is greyed out — its row
   * is the one to edit — and so is a deactivated role, which the API refuses for a new level.
   * The row being edited keeps its own role either way.
   */
  protected readonly roleOptions = computed<RoleOption[]>(() => {
    const value = this.value();
    const editing = this.editing();
    const taken = new Map(
      this.bands()
        .filter(
          (band) =>
            band.businessTypeId === value.businessTypeId &&
            band.claimNatureId === value.claimNatureId &&
            band.id !== editing?.id,
        )
        .map((band) => [band.roleId, band]),
    );
    const inactive = this.inactiveRoleIds();
    return [...this.roleNames().entries()]
      .map(([id, name]) => {
        const keepsOwn = editing?.roleId === id;
        const blockedReason = taken.has(id)
          ? 'Already has a level here'
          : inactive.has(id) && !keepsOwn
            ? 'Inactive role'
            : '';
        return { id, name: name || `Role ${id}`, blockedReason, disabled: blockedReason !== '' };
      })
      .sort((a, b) => Number(a.disabled) - Number(b.disabled) || COLLATOR.compare(a.name, b.name));
  });

  /** What the pending band does, in one sentence — the rule applied to the values typed. */
  protected readonly preview = computed(() => {
    const value = this.value();
    const role = this.roleNames().get(value.roleId);
    if (!role || value.fromAmount === null || value.toAmount === null || this.form.hasError('numberRange')) {
      return '';
    }
    const pair = `${this.nameIn(this.businessTypes(), value.businessTypeId)} · ${this.nameIn(this.claimNatures(), value.claimNatureId)}`;
    return value.fromAmount === 0
      ? `${role} will be in the approval of every ${pair} claim, whatever the amount.`
      : `${role} will be in the approval of every ${pair} claim of ${pkr(value.fromAmount)} or more — including claims above ${pkr(value.toAmount)}.`;
  });

  protected readonly changes = computed<PendingChange[]>(() => {
    const band = this.editing();
    if (!band) {
      return [];
    }
    const value = this.value();
    const out: PendingChange[] = [];
    const add = (field: string, from: string, to: string, differs: boolean) => {
      if (differs) {
        out.push({ label: LEVEL_OF_AUTHORITY_FIELD_LABELS[field], from, to });
      }
    };
    add('businessTypeId', band.row.businessType, this.nameIn(this.businessTypes(), value.businessTypeId), value.businessTypeId !== band.businessTypeId);
    add('claimNatureId', band.row.claimNature, this.nameIn(this.claimNatures(), value.claimNatureId), value.claimNatureId !== band.claimNatureId);
    add('roleId', band.row.roleName, this.roleNames().get(value.roleId) ?? '—', value.roleId !== band.roleId);
    add('fromAmount', pkr(band.from), value.fromAmount === null ? '—' : pkr(value.fromAmount), value.fromAmount !== band.from);
    add('toAmount', pkr(band.to), value.toAmount === null ? '—' : pkr(value.toAmount), value.toAmount !== band.to);
    return out;
  });

  protected readonly movesPair = computed(() => {
    const band = this.editing();
    const value = this.value();
    return !!band && (value.businessTypeId !== band.businessTypeId || value.claimNatureId !== band.claimNatureId);
  });

  protected readonly canSave = computed(() => {
    this.status();
    const mode = this.panel();
    return !this.saving() && (mode.kind === 'new' || (mode.kind === 'edit' && this.changes().length > 0));
  });

  constructor() {
    this.store.refresh();
    this.rolesStore.ensureLoaded();
    this.loadCatalogue();

    // Re-run the duplicate check when the rows it consults change under an open form.
    effect(() => {
      this.bands();
      untracked(() => this.form.updateValueAndValidity());
    });
  }

  hasUnsavedChanges(): boolean {
    return this.panel().kind !== 'try' && this.form.dirty && !this.saving();
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

  protected retry(): void {
    this.store.refresh();
    if (!this.catalogue()) {
      this.loadCatalogue();
    }
  }

  // ─── Pair selection ─────────────────────────────────────────────────────────

  protected selectBusinessType(businessTypeId: number): void {
    this.store.selectedPair.set({ businessTypeId, claimNatureId: this.claimNatureId() });
  }

  protected selectClaimNature(claimNatureId: number): void {
    this.store.selectedPair.set({ businessTypeId: this.businessTypeId(), claimNatureId });
  }

  // ─── Panel ──────────────────────────────────────────────────────────────────

  protected openNew(): void {
    if (!this.confirmDiscard()) {
      return;
    }
    this.attempted.set(false);
    this.form.reset({
      businessTypeId: this.businessTypeId(),
      claimNatureId: this.claimNatureId(),
      roleId: 0,
      fromAmount: null,
      toAmount: null,
    });
    this.panel.set({ kind: 'new' });
  }

  protected openEdit(band: Band): void {
    if (this.panel().kind === 'edit' && this.editing()?.id === band.id) {
      return;
    }
    if (!this.confirmDiscard()) {
      return;
    }
    this.attempted.set(false);
    this.form.reset({
      businessTypeId: band.businessTypeId,
      claimNatureId: band.claimNatureId,
      roleId: band.roleId,
      fromAmount: band.from,
      toAmount: band.to,
    });
    this.panel.set({ kind: 'edit', id: band.id });
  }

  protected closePanel(): void {
    if (!this.confirmDiscard()) {
      return;
    }
    this.form.markAsPristine();
    this.panel.set({ kind: 'try' });
  }

  protected isEditing(band: Band): boolean {
    const mode = this.panel();
    return mode.kind === 'edit' && mode.id === band.id;
  }

  /** Switching rows with unsaved edits asks first, as leaving the screen does. */
  private confirmDiscard(): boolean {
    return !this.hasUnsavedChanges() || confirm('You have unsaved changes to this level. Discard them?');
  }

  // ─── Validation display ─────────────────────────────────────────────────────

  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.attempted());
  }

  protected readonly rangeError = computed(() => {
    this.status();
    const touched = this.form.controls.toAmount.touched || this.attempted();
    return touched && this.form.hasError('numberRange');
  });

  protected readonly duplicate = computed(() => {
    this.status();
    return (this.form.getError('combinationTaken') as Band | undefined) ?? null;
  });

  private duplicateOf(group: AbstractControl): Band | null {
    const businessTypeId = group.get('businessTypeId')?.value as number;
    const claimNatureId = group.get('claimNatureId')?.value as number;
    const roleId = group.get('roleId')?.value as number;
    if (!businessTypeId || !claimNatureId || !roleId) {
      return null;
    }
    const mode = this.panel();
    const selfId = mode.kind === 'edit' ? mode.id : null;
    return (
      this.bands().find(
        (band) =>
          band.id !== selfId &&
          band.businessTypeId === businessTypeId &&
          band.claimNatureId === claimNatureId &&
          band.roleId === roleId,
      ) ?? null
    );
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  protected submit(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || !this.canSave()) {
      return;
    }
    const value = this.form.getRawValue();
    const request: LevelOfAuthorityWriteRequest = {
      businessTypeId: value.businessTypeId,
      claimNatureId: value.claimNatureId,
      roleId: value.roleId,
      fromAmount: value.fromAmount ?? 0,
      toAmount: value.toAmount ?? 0,
    };

    this.saving.set(true);
    const mode = this.panel();

    if (mode.kind === 'edit') {
      this.api
        .update(mode.id, request)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            const saved = response.levelOfAuthority;
            const changed = response.changedFields.map((field) => LEVEL_OF_AUTHORITY_FIELD_LABELS[field] ?? field);
            if (changed.length > 0) {
              this.notifications.success(
                `${saved.roleName}'s level saved. Updated: ${changed.join(', ')}. Applies to claims raised from now on.`,
              );
            } else {
              this.notifications.info(`${saved.roleName}'s level already had these values. Nothing changed.`);
            }
            this.afterSave(saved);
          },
          error: () => this.onWriteError(),
        });
      return;
    }

    this.api
      .create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.notifications.success(
            `${created.roleName} now joins ${created.businessType} · ${created.claimNature} claims from ${pkr(int(created.fromAmount))}.`,
          );
          this.afterSave(created);
        },
        error: () => this.onWriteError(),
      });
  }

  /** Shows the saved row where it now lives — its pair may have changed — and marks it. */
  private afterSave(saved: LevelOfAuthorityResponse): void {
    this.store.upsert(saved);
    this.store.selectedPair.set({ businessTypeId: int(saved.businessTypeId), claimNatureId: int(saved.claimNatureId) });
    this.saving.set(false);
    this.form.markAsPristine();
    this.panel.set({ kind: 'try' });
    this.highlightId.set(int(saved.levelOfAuthorityId));
  }

  /** The toast is the interceptor's. A conflict means the rows moved: reload them so the checks see why. */
  private onWriteError(): void {
    this.saving.set(false);
    this.store.refresh();
    this.rolesStore.refresh();
  }

  private nameIn(options: readonly Option[], id: number): string {
    return options.find((option) => option.id === id)?.name ?? (id ? `#${id}` : '—');
  }
}
