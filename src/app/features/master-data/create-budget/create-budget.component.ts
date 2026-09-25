import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { EMPTY, catchError, concatMap, from, map, merge, of, switchMap, tap } from 'rxjs';

import { int } from '../../../core/api/api.types';
import {
  BudgetApproverResponse,
  BudgetCatalogueResponse,
  BudgetNotificationState,
  BudgetOptionResponse,
  BudgetShellResponse,
  CreateBudgetRequest,
  CreateBudgetResponse,
} from '../../../core/api/master-data.models';
import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { FormatService } from '../../../core/services/format.service';
import { MenuAccessService } from '../../../core/services/menu-access.service';
import { NotificationService } from '../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { PkrCurrencyPipe } from '../../../shared/pipes/pkr-currency.pipe';
import { minSelectionValidator } from '../../../shared/validators/min-selection.validator';
import { oneOfValidator } from '../../../shared/validators/one-of.validator';
import { periodWindowValidator } from '../../../shared/validators/period-window.validator';
import { MasterDataBudgetsApi } from '../services/master-data-budgets.api';
import {
  AMOUNT_MAX,
  BudgetField,
  BudgetRefusal,
  DESCRIPTION_MAX,
  Period,
  PeriodWindow,
  findSchemeType,
  periodIndex,
  periodLabel,
  periodState,
  periodWindow,
  readPreference,
  refusalOf,
  regionDescription,
  toPeriod,
  writePreference,
} from './create-budget.util';
import { MyBudgetsComponent } from './my-budgets/my-budgets.component';

type LineForm = FormGroup<{
  regionCode: FormControl<string>;
  description: FormControl<string>;
  amount: FormControl<number | null>;
}>;

/** Where one region's budget stands during and after a save. */
type LineOutcome =
  | { kind: 'queued' }
  | { kind: 'saving' }
  | { kind: 'refused'; message: string }
  | { kind: 'skipped'; message: string };

interface ReceiptLine {
  regionName: string;
  amount: number;
  shellCode: string;
  /** Refused as a double submit: the shell already existed, nothing new was written. */
  duplicate: boolean;
}

interface Receipt {
  lines: ReceiptLine[];
  attempted: number;
  total: number;
  approver: string;
  notification: BudgetNotificationState | null;
  /** True when every region was saved, so the form was readied for the next budget. */
  complete: boolean;
}

/** A region removed from the batch, kept so ticking it again restores what was typed. */
interface RememberedLine {
  amount: number | null;
  description: string;
  custom: boolean;
}

/** Built-in `required` accepts "   "; the server trims and calls that missing. */
const NOT_BLANK = Validators.pattern(/\S/);

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * Create Budget — Master Data → Budget (MenuID 36), replacing `Budget.aspx`.
 *
 * Builder mode (CLAUDE.md §7): the choices that narrow the next ones come first, and a summary
 * beside the form states what will be saved before the click rather than after it.
 *
 * What changed from legacy, and why the form looks the way it does:
 *
 * - **Scheme first.** A scheme group decides who a budget can be forwarded to, so it leads.
 * - **Current month or later.** The period opens on the current month, the usual case, and its
 *   calendar disables every earlier one. Legacy let Trade Offer and BRD be back-dated up to 12
 *   months and refused other back-dated months only after the click; this screen doesn't.
 * - **Several regions in one go.** Since 2025, 52% of budgets were saved straight after an
 *   identical one differing only in region (93% belong to such a batch, ~5 regions each), each
 *   region with its own amount and a region suffix on the description. Tick several regions and
 *   each becomes its own budget shell, exactly as if saved one by one — the API is unchanged.
 *   One region is the legacy form.
 * - **Pickers fill themselves** when there is only one choice, remember the last criterion and
 *   the last approver per scheme group, and are cached, so the second budget costs no requests.
 * - **The next budget starts from this one.** After a save the period, scheme, regions and
 *   approver stay; "Reuse" on any row of the grids below copies that budget into the form.
 */
@Component({
  selector: 'to-create-budget',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    PkrCurrencyPipe,
    MyBudgetsComponent,
  ],
  templateUrl: './create-budget.component.html',
  styleUrl: './create-budget.component.scss',
  host: {
    '(document:keydown.control.s)': 'onSaveShortcut($event)',
    '(document:keydown.meta.s)': 'onSaveShortcut($event)',
  },
})
export class CreateBudgetComponent implements HasUnsavedChanges {
  private readonly api = inject(MasterDataBudgetsApi);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly notifications = inject(NotificationService);
  private readonly format = inject(FormatService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly limits = { description: DESCRIPTION_MAX, amount: AMOUNT_MAX };
  protected readonly periodLabel = periodLabel;

  // ─── Reference data ─────────────────────────────────────────────────────────
  // Declared before the form: its validators read these while it is being built.

  protected readonly catalogue = signal<BudgetCatalogueResponse | null>(null);
  protected readonly catalogueFailed = signal(false);

  /** The options for one criterion, tagged with it so a late answer is never shown for another. */
  private readonly values = signal<{
    criterion: string;
    options: BudgetOptionResponse[];
    codes: ReadonlySet<string>;
  } | null>(null);
  protected readonly valuesLoading = signal(false);
  protected readonly valuesFailed = signal(false);

  private readonly approvers = signal<{
    key: string;
    list: BudgetApproverResponse[];
    ids: ReadonlySet<string>;
  } | null>(null);
  protected readonly approversLoading = signal(false);
  protected readonly approversFailed = signal(false);
  /** Why the Forward To choice is already filled in, if it was not picked by hand. */
  protected readonly forwardToReason = signal<'remembered' | 'only' | 'reused' | null>(null);
  private readonly approversReload = signal(0);
  private readonly valuesReload = signal(0);
  /** The approver of a budget copied with Reuse, applied once that scheme group's list is in. */
  private pendingForwardTo: string | null = null;

  // ─── The form ───────────────────────────────────────────────────────────────

  protected readonly form = this.fb.nonNullable.group(
    {
      schemeGroupKey: ['', [Validators.required]],
      schemeTypeId: [0, [Validators.min(1), oneOfValidator(() => this.schemeTypeIdsOfGroup())]],
      year: [0, [Validators.min(1)]],
      month: [0, [Validators.min(1)]],
      criterion: ['', [Validators.required]],
      value: ['', [Validators.required, oneOfValidator(() => this.valueCodes())]],
      description: ['', [Validators.required, NOT_BLANK, Validators.maxLength(DESCRIPTION_MAX)]],
      suffixRegion: [true],
      lines: this.fb.array<LineForm>([], [minSelectionValidator(1)]),
      forwardToUserId: ['', [Validators.required, oneOfValidator(() => this.approverIds())]],
    },
    { validators: [periodWindowValidator('year', 'month', () => this.currentWindow())] },
  );

  protected get lines(): FormArray<LineForm> {
    return this.form.controls.lines;
  }

  /** The form's value as a signal, so everything derived from it is a plain computed. */
  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  /**
   * The month calendar's value. Outside the form: the form keeps `year` and `month`, which are
   * what the request, the window validator and Reuse deal in. Each follows the other.
   */
  protected readonly periodPicker = new FormControl<Date | null>(null);

  // ─── Save state ─────────────────────────────────────────────────────────────

  protected readonly saving = signal(false);
  protected readonly progress = signal({ done: 0, total: 0 });
  /** Set by the first submit, so untouched fields only turn red once a save was tried. */
  protected readonly attempted = signal(false);
  protected readonly outcomes = signal<ReadonlyMap<string, LineOutcome>>(new Map());
  /** Refusals about a field every region shares, placed on that field. Cleared by the next edit. */
  protected readonly serverErrors = signal<Partial<Record<BudgetField | 'general', string>>>({});
  protected readonly receipt = signal<Receipt | null>(null);
  /** Every shell saved on this visit — the grid below marks them and re-reads when it grows. */
  protected readonly createdCodes = signal<ReadonlySet<string>>(new Set());

  /** Region codes whose description was typed rather than derived. */
  private readonly customDescriptions = signal<ReadonlySet<string>>(new Set());
  private readonly regionMemory = new Map<string, RememberedLine>();

  // ─── Derived: scheme ────────────────────────────────────────────────────────

  protected readonly schemeGroups = computed(() =>
    [...(this.catalogue()?.schemeGroups ?? [])].sort((a, b) => COLLATOR.compare(a.name, b.name)),
  );

  protected readonly selectedGroup = computed(
    () => this.schemeGroups().find((group) => group.schemeGroupKey === this.value().schemeGroupKey) ?? null,
  );

  protected readonly schemeTypeOptions = computed(() =>
    (this.selectedGroup()?.schemeTypes ?? [])
      .map((type) => ({ id: int(type.schemeTypeId), name: type.name }))
      .sort((a, b) => COLLATOR.compare(a.name, b.name)),
  );

  protected readonly selectedType = computed(() => {
    const match = findSchemeType(this.catalogue(), this.value().schemeTypeId);
    return match && match.group.schemeGroupKey === this.value().schemeGroupKey ? match.type : null;
  });

  // ─── Derived: period ────────────────────────────────────────────────────────

  protected readonly window = computed<PeriodWindow | null>(() => periodWindow(this.catalogue()));

  protected readonly currentPeriod = computed<Period | null>(() => toPeriod(this.catalogue()?.currentPeriod));

  /** The grids' Year filter: the server's year, and the last year a budget can be raised for. */
  protected readonly gridYears = computed(() => {
    const current = this.currentPeriod()?.year ?? new Date().getFullYear();
    return { current, latest: toPeriod(this.catalogue()?.latestPeriod)?.year ?? current + 2 };
  });

  /** The calendar's bounds: the first and last day of the window's end months. */
  protected readonly pickerBounds = computed(() => {
    const window = this.window();
    return {
      min: window ? new Date(window.earliest.year, window.earliest.month - 1, 1) : null,
      max: window ? new Date(window.latest.year, window.latest.month, 0) : null,
    };
  });

  /** Where the chosen month sits against this month: "This month", "Next month", "3 months ahead". */
  protected readonly periodRelation = computed(() => {
    const { year, month } = this.value();
    const current = this.currentPeriod();
    if (!current || year < 1 || month < 1) {
      return null;
    }
    const offset = periodIndex({ year, month }) - periodIndex(current);
    if (offset < 0) {
      return null;
    }
    if (offset === 0) {
      return { offset, label: 'This month' };
    }
    return { offset, label: offset === 1 ? 'Next month' : `${offset} months ahead` };
  });

  // ─── Derived: product ───────────────────────────────────────────────────────

  protected readonly criteria = computed(() => this.catalogue()?.criteria ?? []);

  protected readonly criterionLabel = computed(
    () => this.criteria().find((criterion) => criterion.criterion === this.value().criterion)?.dimension ?? '',
  );

  protected readonly valueOptions = computed(() => {
    const loaded = this.values();
    return loaded && loaded.criterion === this.value().criterion ? loaded.options : [];
  });

  protected readonly valueName = computed(() => {
    const code = this.value().value;
    return code ? (this.valueOptions().find((option) => option.code === code)?.name ?? '') : '';
  });

  // ─── Derived: regions ───────────────────────────────────────────────────────

  protected readonly regions = computed(() => this.catalogue()?.regions ?? []);

  private readonly regionNames = computed(
    () => new Map(this.regions().map((region) => [region.code, region.name || region.code])),
  );

  protected readonly selectedRegions = computed(() => new Set(this.value().lines.map((line) => line.regionCode)));

  protected readonly multiRegion = computed(() => this.value().lines.length > 1);

  protected readonly lineViews = computed(() => {
    const names = this.regionNames();
    const outcomes = this.outcomes();
    const custom = this.customDescriptions();
    return this.value().lines.map((line, index) => ({
      index,
      code: line.regionCode,
      name: names.get(line.regionCode) ?? line.regionCode,
      amount: line.amount,
      compact: line.amount && line.amount >= 1000 ? this.format.formatCompact(line.amount) : '',
      custom: custom.has(line.regionCode),
      outcome: outcomes.get(line.regionCode) ?? null,
      note: (() => {
        const outcome = outcomes.get(line.regionCode);
        return outcome && (outcome.kind === 'refused' || outcome.kind === 'skipped') ? outcome.message : '';
      })(),
    }));
  });

  protected readonly totalAmount = computed(() =>
    this.value().lines.reduce((sum, line) => sum + (line.amount && line.amount > 0 ? line.amount : 0), 0),
  );

  // ─── Derived: approver ──────────────────────────────────────────────────────

  protected readonly approverOptions = computed(() => {
    const loaded = this.approvers();
    return loaded && loaded.key === this.value().schemeGroupKey
      ? [...loaded.list].sort((a, b) => COLLATOR.compare(a.fullName || a.userId, b.fullName || b.userId))
      : [];
  });

  protected readonly approverName = computed(() => {
    const id = this.value().forwardToUserId;
    const approver = this.approverOptions().find((candidate) => candidate.userId === id);
    return approver ? approver.fullName || approver.userId : '';
  });

  // ─── Derived: whole form ────────────────────────────────────────────────────

  /** Loaded, but the caller holds no role that starts a budget's approval cycle. */
  protected readonly cannotInitiate = computed(() => {
    const catalogue = this.catalogue();
    return !!catalogue && catalogue.schemeGroups.length === 0;
  });

  protected readonly invalidCount = computed(() => {
    this.status();
    this.value();
    const top = Object.entries(this.form.controls).filter(
      ([name, control]) => name !== 'lines' && control.invalid,
    ).length;
    const lines = this.lines.controls.filter((line) => line.invalid).length;
    const period = this.form.hasError('periodBefore') || this.form.hasError('periodAfter') ? 1 : 0;
    return top + lines + period + (this.lines.length === 0 ? 1 : 0);
  });

  protected readonly saveLabel = computed(() => {
    const count = this.value().lines.length;
    if (this.saving()) {
      const { done, total } = this.progress();
      return total > 1 ? `Saving ${Math.min(done + 1, total)} of ${total}…` : 'Saving…';
    }
    return count > 1 ? `Save ${count} budgets` : 'Save budget';
  });

  constructor() {
    this.loadCatalogue();

    // The Select picker follows the criterion. switchMap drops an answer for a criterion that
    // has since been changed; the service caches each criterion's options for ten minutes.
    toObservable(
      computed(() => ({ criterion: this.value().criterion, reload: this.valuesReload() }), {
        equal: (a, b) => a.criterion === b.criterion && a.reload === b.reload,
      }),
    )
      .pipe(
        switchMap(({ criterion }) => {
          this.valuesFailed.set(false);
          if (!criterion) {
            this.valuesLoading.set(false);
            return EMPTY;
          }
          this.valuesLoading.set(true);
          return this.api.criterionValues(criterion).pipe(
            tap((options) => this.onValuesLoaded(criterion, options)),
            catchError(() => {
              this.valuesLoading.set(false);
              this.valuesFailed.set(true);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // The Forward To picker follows the scheme group.
    toObservable(
      computed(() => ({ key: this.value().schemeGroupKey, reload: this.approversReload() }), {
        equal: (a, b) => a.key === b.key && a.reload === b.reload,
      }),
    )
      .pipe(
        switchMap(({ key }) => {
          this.approversFailed.set(false);
          if (!key) {
            this.approversLoading.set(false);
            return EMPTY;
          }
          this.approversLoading.set(true);
          return this.api.approvers(key).pipe(
            tap((list) => this.onApproversLoaded(key, list)),
            catchError(() => {
              this.approversLoading.set(false);
              this.approversFailed.set(true);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // The calendar shows whatever the form holds — the default, a Reuse, a Start over.
    effect(() => {
      const { year, month } = this.value();
      const shown = this.periodPicker.value;
      if (year < 1 || month < 1) {
        if (shown) {
          this.periodPicker.setValue(null, { emitEvent: false });
        }
      } else if (!shown || shown.getFullYear() !== year || shown.getMonth() + 1 !== month) {
        this.periodPicker.setValue(new Date(year, month - 1, 1), { emitEvent: false });
      }
    });

    // Derived region descriptions follow the shared one and the suffix switch.
    merge(this.form.controls.description.valueChanges, this.form.controls.suffixRegion.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.syncLineDescriptions());

    // A refusal placed on a field stands until that field is edited. Forward To is cleared
    // by a pick (onForwardToPicked), not by any change: re-reading the list after such a
    // refusal changes the control itself, and would wipe the explanation of why.
    const controls = this.form.controls;
    const clearOn = (field: BudgetField, ...sources: AbstractControl[]) =>
      merge(...sources.map((control) => control.valueChanges))
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.clearServerError(field));
    clearOn('period', controls.year, controls.month, controls.schemeTypeId);
    clearOn('schemeType', controls.schemeGroupKey, controls.schemeTypeId);
    clearOn('value', controls.criterion, controls.value);
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  protected loadCatalogue(): void {
    this.catalogueFailed.set(false);
    this.api
      .catalogue()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogue) => this.onCatalogueLoaded(catalogue),
        error: () => this.catalogueFailed.set(true),
      });
  }

  private onCatalogueLoaded(catalogue: BudgetCatalogueResponse): void {
    this.catalogue.set(catalogue);
    const patch: Partial<{ schemeGroupKey: string; schemeTypeId: number; year: number; month: number; criterion: string }> =
      {};

    // One scheme group, or one scheme type, is not a choice.
    if (!this.form.controls.schemeGroupKey.value && catalogue.schemeGroups.length === 1) {
      const group = catalogue.schemeGroups[0];
      patch.schemeGroupKey = group.schemeGroupKey;
      if (group.schemeTypes.length === 1) {
        patch.schemeTypeId = int(group.schemeTypes[0].schemeTypeId);
      }
    }

    // Most budgets are for the month they are raised in, and every scheme type accepts it.
    const current = toPeriod(catalogue.currentPeriod);
    if (current && (!this.form.controls.year.value || !this.form.controls.month.value)) {
      patch.year = current.year;
      patch.month = current.month;
    }

    // The criterion this user picked last time, so its options load alongside everything else.
    if (!this.form.controls.criterion.value) {
      const remembered = readPreference(this.menuAccess.userId(), 'criterion');
      if (catalogue.criteria.some((criterion) => criterion.criterion === remembered)) {
        patch.criterion = remembered;
      }
    }

    this.form.patchValue(patch);
    this.form.updateValueAndValidity();
  }

  private onValuesLoaded(criterion: string, options: BudgetOptionResponse[]): void {
    const sorted = [...options].sort((a, b) => COLLATOR.compare(a.name || a.code, b.name || b.code));
    this.values.set({ criterion, options: sorted, codes: new Set(sorted.map((option) => option.code)) });
    this.valuesLoading.set(false);
    const control = this.form.controls.value;
    if (!control.value && sorted.length === 1) {
      control.setValue(sorted[0].code);
    }
    control.updateValueAndValidity();
  }

  private onApproversLoaded(key: string, list: BudgetApproverResponse[]): void {
    this.approvers.set({ key, list, ids: new Set(list.map((approver) => approver.userId)) });
    this.approversLoading.set(false);
    this.applyApproverDefault(key, list);
    this.form.controls.forwardToUserId.updateValueAndValidity();
  }

  /**
   * Fills Forward To when there is an obvious answer: the approver of a budget being reused,
   * then the one this user forwarded this scheme group to last time, then the only one there is.
   * A choice already made that is still on the list is kept.
   */
  private applyApproverDefault(key: string, list: readonly BudgetApproverResponse[]): void {
    const control = this.form.controls.forwardToUserId;
    const ids = new Set(list.map((approver) => approver.userId));
    const reused = this.pendingForwardTo;
    this.pendingForwardTo = null;

    if (reused && ids.has(reused)) {
      control.setValue(reused);
      this.forwardToReason.set('reused');
      return;
    }
    if (control.value && ids.has(control.value)) {
      return;
    }
    const remembered = readPreference(this.menuAccess.userId(), `forwardTo.${key}`);
    if (remembered && ids.has(remembered)) {
      control.setValue(remembered);
      this.forwardToReason.set('remembered');
      return;
    }
    control.setValue(list.length === 1 ? list[0].userId : '');
    this.forwardToReason.set(list.length === 1 ? 'only' : null);
  }

  protected retryValues(): void {
    this.valuesReload.update((value) => value + 1);
  }

  protected retryApprovers(): void {
    this.approversReload.update((value) => value + 1);
  }

  protected prefetchValues(criterion: string): void {
    this.api.prefetchCriterionValues(criterion);
  }

  protected prefetchApprovers(schemeGroupKey: string): void {
    this.api.prefetchApprovers(schemeGroupKey);
  }

  // ─── Validator sources ──────────────────────────────────────────────────────
  // Methods rather than computeds: the validators run while the form is still being built,
  // and must read the controls' current values, which are not signals. Null means "not
  // loaded yet", which the validators treat as passing.

  private valueCodes(): ReadonlySet<string> | null {
    const loaded = this.values();
    return loaded && loaded.criterion === this.form?.controls.criterion.value ? loaded.codes : null;
  }

  private approverIds(): ReadonlySet<string> | null {
    const loaded = this.approvers();
    return loaded && loaded.key === this.form?.controls.schemeGroupKey.value ? loaded.ids : null;
  }

  private schemeTypeIdsOfGroup(): ReadonlySet<number> | null {
    const key = this.form?.controls.schemeGroupKey.value;
    const group = this.catalogue()?.schemeGroups.find((candidate) => candidate.schemeGroupKey === key);
    return group ? new Set(group.schemeTypes.map((type) => int(type.schemeTypeId))) : null;
  }

  /** The window the period validator checks. */
  private currentWindow(): PeriodWindow | null {
    return periodWindow(this.catalogue());
  }

  protected onSchemeGroupChange(): void {
    const types = this.selectedGroup()?.schemeTypes ?? [];
    const typeId = this.form.controls.schemeTypeId.value;
    if (!types.some((type) => int(type.schemeTypeId) === typeId)) {
      this.form.controls.schemeTypeId.setValue(types.length === 1 ? int(types[0].schemeTypeId) : 0);
    }
    this.form.controls.schemeTypeId.updateValueAndValidity();
    this.form.controls.forwardToUserId.setValue('');
    this.forwardToReason.set(null);
    this.form.updateValueAndValidity();
  }

  // ─── Period ─────────────────────────────────────────────────────────────────

  protected onPeriodPicked(date: Date | null): void {
    if (!date) {
      return;
    }
    this.setPeriod({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }

  protected useCurrentPeriod(): void {
    const current = this.currentPeriod();
    if (current) {
      this.setPeriod(current);
    }
  }

  private setPeriod(period: Period): void {
    const { year, month } = this.form.controls;
    if (year.value !== period.year || month.value !== period.month) {
      this.form.patchValue({ year: period.year, month: period.month });
      year.markAsDirty();
    }
    year.markAsTouched();
    month.markAsTouched();
    this.form.updateValueAndValidity();
  }

  // ─── Product ────────────────────────────────────────────────────────────────

  protected setCriterion(criterion: string): void {
    if (this.form.controls.criterion.value === criterion) {
      return;
    }
    this.form.controls.value.setValue('');
    this.setChoice(this.form.controls.criterion, criterion);
  }

  // ─── Regions ────────────────────────────────────────────────────────────────

  protected toggleRegion(code: string): void {
    const index = this.lines.controls.findIndex((line) => line.controls.regionCode.value === code);
    if (index >= 0) {
      this.removeLine(index);
    } else {
      this.addLine(code);
    }
    this.lines.markAsDirty();
    this.lines.markAsTouched();
    this.syncLineDescriptions();
  }

  protected selectAllRegions(): void {
    for (const region of this.regions()) {
      if (!this.selectedRegions().has(region.code)) {
        this.addLine(region.code);
      }
    }
    this.lines.markAsDirty();
    this.syncLineDescriptions();
  }

  protected clearRegions(): void {
    while (this.lines.length > 0) {
      this.removeLine(this.lines.length - 1);
    }
    this.lines.markAsDirty();
    this.syncLineDescriptions();
  }

  /** Inserted in the regions' own order, so the lines read like the chips above them. */
  private addLine(code: string, amount: number | null = null): void {
    const remembered = this.regionMemory.get(code);
    const order = this.regions().map((region) => region.code);
    const position = this.lines.controls.filter(
      (line) => order.indexOf(line.controls.regionCode.value) < order.indexOf(code),
    ).length;
    this.lines.insert(
      position,
      this.fb.nonNullable.group({
        regionCode: [code],
        description: [
          remembered?.custom ? remembered.description : '',
          [Validators.required, NOT_BLANK, Validators.maxLength(DESCRIPTION_MAX)],
        ],
        amount: this.fb.control<number | null>(amount ?? remembered?.amount ?? null, [
          Validators.required,
          Validators.min(1),
          Validators.max(AMOUNT_MAX),
        ]),
      }),
    );
    if (remembered?.custom) {
      this.customDescriptions.update((set) => new Set(set).add(code));
    }
  }

  private removeLine(index: number): void {
    const line = this.lines.at(index);
    const code = line.controls.regionCode.value;
    this.regionMemory.set(code, {
      amount: line.controls.amount.value,
      description: line.controls.description.value,
      custom: this.customDescriptions().has(code),
    });
    this.lines.removeAt(index);
    this.forgetCustom(code);
    this.outcomes.update((map) => {
      const next = new Map(map);
      next.delete(code);
      return next;
    });
  }

  /** A line's description once typed is its own; until then it follows the shared one. */
  protected markCustom(code: string): void {
    if (!this.customDescriptions().has(code)) {
      this.customDescriptions.update((set) => new Set(set).add(code));
    }
  }

  protected resetDescription(code: string): void {
    this.forgetCustom(code);
    this.syncLineDescriptions();
  }

  private forgetCustom(code: string): void {
    if (this.customDescriptions().has(code)) {
      this.customDescriptions.update((set) => {
        const next = new Set(set);
        next.delete(code);
        return next;
      });
    }
  }

  private syncLineDescriptions(): void {
    const lines = this.lines.controls;
    // A single region has no description of its own on screen, so it always follows the shared one.
    if (lines.length <= 1 && this.customDescriptions().size > 0) {
      this.customDescriptions.set(new Set());
    }
    const base = this.form.controls.description.value;
    const suffix = this.form.controls.suffixRegion.value && lines.length > 1;
    const names = this.regionNames();
    for (const line of lines) {
      const code = line.controls.regionCode.value;
      if (this.customDescriptions().has(code)) {
        continue;
      }
      const derived = regionDescription(base, names.get(code) ?? code, suffix);
      if (line.controls.description.value !== derived) {
        line.controls.description.setValue(derived);
      }
    }
  }

  // ─── Validation display ─────────────────────────────────────────────────────

  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.attempted());
  }

  protected periodError(): string {
    const { year, month } = this.form.controls;
    if ((year.invalid || month.invalid) && (year.touched || month.touched || this.attempted())) {
      return 'Pick a month.';
    }
    const before = this.form.getError('periodBefore') as { earliest: Period } | null;
    if (before) {
      const type = this.selectedType()?.name ?? 'This scheme type';
      return `${type} accepts budgets from ${periodLabel(before.earliest)} onwards.`;
    }
    const after = this.form.getError('periodAfter') as { latest: Period } | null;
    if (after) {
      return `Budgets can be created up to ${periodLabel(after.latest)}.`;
    }
    return this.serverErrors().period ?? '';
  }

  protected amountError(control: AbstractControl): string {
    if (control.hasError('required')) {
      return 'Enter an amount.';
    }
    return 'Enter a whole amount from 1.';
  }

  // ─── Reuse a budget from the grids ──────────────────────────────────────────

  /**
   * Copies a saved budget into the form: its scheme, product, region, description, amount and
   * first approver. The period is kept if it is this month or later; an earlier one becomes
   * the current month.
   */
  protected reuse(shell: BudgetShellResponse): void {
    const catalogue = this.catalogue();
    if (!catalogue || this.saving()) {
      return;
    }
    const match = findSchemeType(catalogue, int(shell.schemeTypeId));
    const notes: string[] = [];
    if (!match) {
      notes.push(`you can no longer raise ${shell.schemeType || 'that scheme type'} budgets`);
    }

    const period = { year: int(shell.year), month: int(shell.month) };
    const periodOpen = periodState(period, periodWindow(catalogue)) === 'open';
    const current = toPeriod(catalogue.currentPeriod);

    this.clearRegions();
    this.regionMemory.clear();
    this.outcomes.set(new Map());
    this.receipt.set(null);
    this.attempted.set(false);

    const firstApprover = shell.approvalSteps.find((step) => int(step.level) === 1)?.userId ?? null;
    this.pendingForwardTo = firstApprover;

    this.form.patchValue({
      schemeGroupKey: match?.group.schemeGroupKey ?? '',
      schemeTypeId: match ? int(match.type.schemeTypeId) : 0,
      year: periodOpen || !current ? period.year : current.year,
      month: periodOpen || !current ? period.month : current.month,
      criterion: shell.criterion,
      value: shell.value,
      description: shell.description,
    });

    if (catalogue.regions.some((region) => region.code === shell.regionCode)) {
      this.addLine(shell.regionCode, int(shell.amount) || null);
    } else {
      notes.push(`${shell.regionName || 'its region'} is no longer an active region`);
    }
    this.syncLineDescriptions();

    // The group may be the one already loaded, in which case no new list will arrive.
    const loaded = this.approvers();
    if (loaded && loaded.key === this.form.controls.schemeGroupKey.value) {
      this.applyApproverDefault(loaded.key, loaded.list);
    }

    this.form.markAsDirty();
    this.form.updateValueAndValidity();
    this.host.nativeElement.querySelector('[data-cb-top]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!periodOpen) {
      const fallback = current ? `, so the period is ${periodLabel(current)}` : ', so pick a month';
      notes.push(`${periodLabel(period)} can no longer be budgeted${fallback}`);
    }
    const detail = notes.length > 0 ? ` Note: ${notes.join('; ')}.` : ' Check the period and amount, then save.';
    this.notifications.info(`Copied ${shell.shellCode} into the form.${detail}`, 'Reused');
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  protected onSaveShortcut(event: Event): void {
    event.preventDefault();
    if (!this.cannotInitiate() && this.catalogue()) {
      this.submit();
    }
  }

  protected submit(): void {
    if (this.saving()) {
      return;
    }
    this.attempted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.revealFirstProblem();
      return;
    }

    const value = this.form.getRawValue();
    const shared = {
      year: value.year,
      month: value.month,
      criterion: value.criterion,
      value: value.value,
      schemeTypeId: value.schemeTypeId,
      forwardToUserId: value.forwardToUserId,
    };
    const names = this.regionNames();
    const lines = value.lines.map((line) => ({
      code: line.regionCode,
      name: names.get(line.regionCode) ?? line.regionCode,
      description: line.description.trim(),
      amount: line.amount ?? 0,
    }));
    const approver = this.approverName() || value.forwardToUserId;
    const groupKey = value.schemeGroupKey;

    this.serverErrors.set({});
    this.receipt.set(null);
    this.saving.set(true);
    this.progress.set({ done: 0, total: lines.length });
    this.outcomes.set(new Map(lines.map((line) => [line.code, { kind: 'queued' } as LineOutcome])));

    const saved: { line: (typeof lines)[number]; shellCode: string; duplicate: boolean; response: CreateBudgetResponse | null }[] = [];
    let stop: BudgetRefusal | null = null;

    from(lines)
      .pipe(
        concatMap((line) => {
          if (stop) {
            this.setOutcome(line.code, { kind: 'skipped', message: 'Not saved — the batch stopped.' });
            return EMPTY;
          }
          this.setOutcome(line.code, { kind: 'saving' });
          const request: CreateBudgetRequest = {
            ...shared,
            regionCode: line.code,
            description: line.description,
            amount: line.amount,
          };
          return this.api.create(request).pipe(
            map((response) => ({ line, response, refusal: null as BudgetRefusal | null })),
            catchError((error: unknown) => of({ line, response: null, refusal: refusalOf(error) })),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ line, response, refusal }) => {
          this.progress.update((progress) => ({ ...progress, done: progress.done + 1 }));
          if (response) {
            saved.push({ line, shellCode: response.budget.shellCode, duplicate: false, response });
            return;
          }
          if (!refusal) {
            return;
          }
          if (refusal.existingShellCode) {
            saved.push({ line, shellCode: refusal.existingShellCode, duplicate: true, response: null });
            return;
          }
          if (refusal.lineOnly) {
            this.setOutcome(line.code, { kind: 'refused', message: refusal.message });
            return;
          }
          // Every region would be refused the same way: stop, and put the reason on its field.
          stop = refusal;
          this.setOutcome(line.code, { kind: 'skipped', message: 'Not saved — see the message above.' });
        },
        complete: () => this.finishBatch(saved, lines.length, approver, groupKey, stop),
      });
  }

  private finishBatch(
    saved: readonly {
      line: { code: string; name: string; amount: number };
      shellCode: string;
      duplicate: boolean;
      response: CreateBudgetResponse | null;
    }[],
    attempted: number,
    approver: string,
    groupKey: string,
    stop: BudgetRefusal | null,
  ): void {
    const savedCodes = new Set(saved.map((entry) => entry.line.code));
    const complete = saved.length === attempted;
    const reusableRegions = this.lines.controls.map((line) => line.controls.regionCode.value);

    // Saved regions leave the form; anything refused stays, with its reason on its line.
    for (let index = this.lines.length - 1; index >= 0; index--) {
      const code = this.lines.at(index).controls.regionCode.value;
      if (savedCodes.has(code)) {
        this.lines.removeAt(index);
        this.forgetCustom(code);
        this.regionMemory.delete(code);
      }
    }
    this.outcomes.update((map) => {
      const next = new Map(map);
      for (const code of savedCodes) {
        next.delete(code);
      }
      return next;
    });

    if (saved.length > 0) {
      const userId = this.menuAccess.userId();
      writePreference(userId, 'criterion', this.form.controls.criterion.value);
      writePreference(userId, `forwardTo.${groupKey}`, this.form.controls.forwardToUserId.value);
      this.createdCodes.update((codes) => new Set([...codes, ...saved.map((entry) => entry.shellCode)]));
    }

    if (complete) {
      // Ready for the next budget of the batch: same scheme, period, regions and approver —
      // the next one almost always differs in product, description and amounts.
      this.form.patchValue({ value: '', description: '' }, { emitEvent: false });
      for (const code of reusableRegions) {
        this.addLine(code);
      }
      this.customDescriptions.set(new Set());
      this.regionMemory.clear();
      this.form.updateValueAndValidity();
      this.syncLineDescriptions();
      this.form.markAsPristine();
      this.form.markAsUntouched();
      this.attempted.set(false);
    }

    const notifications = saved.flatMap((entry) => (entry.response ? [entry.response.approverNotification] : []));
    this.receipt.set({
      lines: saved.map((entry) => ({
        regionName: entry.line.name,
        amount: entry.line.amount,
        shellCode: entry.shellCode,
        duplicate: entry.duplicate,
      })),
      attempted,
      total: saved.reduce((sum, entry) => sum + entry.line.amount, 0),
      approver,
      notification: notifications.find((state) => state !== 'Queued') ?? notifications[0] ?? null,
      complete,
    });

    if (stop) {
      const field = stop.field ?? 'general';
      this.serverErrors.set({ [field]: stop.message });
      if (stop.field === 'forwardTo') {
        // The list we offered is out of date: read it again.
        this.api.forgetApprovers(groupKey);
        this.retryApprovers();
      }
    }

    this.saving.set(false);

    if (saved.length === 0) {
      if (!stop?.toasted) {
        this.notifications.error(stop?.message ?? 'No budget was saved. Each region says why.', 'Not saved');
      }
    } else if (complete) {
      const what = saved.length === 1 ? `Budget ${saved[0].shellCode} saved` : `${saved.length} budgets saved`;
      this.notifications.success(`${what} and forwarded to ${approver}.`, 'Saved');
    } else {
      this.notifications.warn(
        `${saved.length} of ${attempted} budgets saved. The regions still in the form need attention.`,
        'Partly saved',
      );
    }
  }

  protected onForwardToPicked(): void {
    this.forwardToReason.set(null);
    this.clearServerError('forwardTo');
  }

  private clearServerError(field: BudgetField): void {
    if (!this.saving() && this.serverErrors()[field]) {
      this.serverErrors.update((errors) => {
        const next = { ...errors };
        delete next[field];
        return next;
      });
    }
  }

  private setOutcome(code: string, outcome: LineOutcome): void {
    this.outcomes.update((map) => new Map(map).set(code, outcome));
  }

  /** Clears everything, including what the grids below would reuse. */
  protected startOver(): void {
    if (this.saving()) {
      return;
    }
    this.clearRegions();
    this.regionMemory.clear();
    this.outcomes.set(new Map());
    this.receipt.set(null);
    this.serverErrors.set({});
    this.attempted.set(false);
    const current = this.currentPeriod();
    this.form.reset({
      schemeGroupKey: '',
      schemeTypeId: 0,
      year: current?.year ?? 0,
      month: current?.month ?? 0,
      criterion: this.form.controls.criterion.value,
      value: '',
      description: '',
      suffixRegion: true,
      forwardToUserId: '',
    });
    this.forwardToReason.set(null);
    const catalogue = this.catalogue();
    if (catalogue) {
      this.onCatalogueLoaded(catalogue);
    }
    this.form.markAsPristine();
  }

  private setChoice<T>(control: FormControl<T>, value: T): void {
    if (control.value !== value) {
      control.setValue(value);
      control.markAsDirty();
    }
    control.markAsTouched();
    this.form.updateValueAndValidity();
  }

  /** Brings the first field that needs attention into view, rather than leaving it off-screen. */
  private revealFirstProblem(): void {
    queueMicrotask(() =>
      this.host.nativeElement
        .querySelector('[data-invalid="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  }

  protected notificationNote(receipt: Receipt): string {
    switch (receipt.notification) {
      case 'Queued':
        return `${receipt.approver} is being emailed.`;
      case 'Disabled':
        return `Email is switched off on this server, so let ${receipt.approver} know.`;
      case 'NoEmailAddress':
        return `${receipt.approver} has no email address on file, so let them know.`;
      case 'QueueFull':
        return `The email to ${receipt.approver} could not be queued, so let them know.`;
      default:
        return '';
    }
  }

}
