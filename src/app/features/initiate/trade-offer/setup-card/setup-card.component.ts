import { Component, DestroyRef, ElementRef, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { map } from 'rxjs';

import { dec, int } from '../../../../core/api/api.types';
import { SaveTradeOfferSchemeRequest, TradeOfferScheme } from '../../../../core/api/initiate.models';
import { MenuAccessService } from '../../../../core/services/menu-access.service';
import { NotificationService } from '../../../../core/services/notification.service';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { schemePeriodValidator } from '../../../../shared/validators/scheme-period.validator';
import { TradeOffersApi } from '../../services/trade-offers.api';
import { CopyOutcome, TradeOfferStore } from '../trade-offer.store';
import {
  DateRange,
  TradeOfferRefusal,
  daysIn,
  endOfMonth,
  followingToDate,
  formatDate,
  isStaleScheme,
  parseIsoDate,
  periodPresets,
  readPreference,
  refusalOf,
  sameMonth,
  sequenceIdIn,
  startOfDay,
  toIsoDate,
  writePreference,
} from '../trade-offer.util';

/** Built-in `required` accepts "   "; the server trims and calls that missing. */
const NOT_BLANK = Validators.pattern(/\S/);

/** The claim type most schemes use (88% since 2025), when this user has no last choice. */
const USUAL_CLAIM_TYPE = 'TO';

type SetupField = 'period' | 'schemeId' | 'description' | 'discountType' | 'schemeType' | 'claimType' | 'claimPercentage';

const FIELD_OF: Readonly<Record<string, SetupField>> = {
  date_duration: 'period',
  scheme_id_too_long: 'schemeId',
  description_too_long: 'description',
  unknown_discount_type: 'discountType',
  unknown_scheme_type: 'schemeType',
  unknown_claim_type: 'claimType',
  claim_percentage_out_of_range: 'claimPercentage',
};

/**
 * 1 · Setup — the top of legacy's form, above its first Save: dates, scheme id, description,
 * discount, scheme and claim types, claim percentage. Creates the scheme (Scheme Status New)
 * or saves an existing one's setup.
 */
@Component({
  selector: 'to-trade-offer-setup-card',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
  ],
  templateUrl: './setup-card.component.html',
  styleUrl: './setup-card.component.scss',
})
export class SetupCardComponent implements OnDestroy {
  protected readonly store = inject(TradeOfferStore);
  private readonly api = inject(TradeOffersApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly menuAccess = inject(MenuAccessService);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly formatDate = formatDate;

  private readonly catalogue = this.store.catalogue()!;
  protected readonly limits = {
    schemeId: int(this.catalogue.schemeIdMaxLength, 10),
    description: int(this.catalogue.descriptionMaxLength, 60),
  };
  protected readonly discountTypes = this.catalogue.discountTypes;
  protected readonly schemeTypes = this.catalogue.schemeTypes;
  protected readonly claimTypes = this.catalogue.claimTypes;
  /** The claim type that takes a percentage — WD, Whole Sale Claim. */
  protected readonly percentageClaimType =
    this.claimTypes.find((type) => type.claimPercentageEditable)?.name ?? 'Whole Sale Claim';

  protected readonly form = this.fb.group(
    {
      fromDate: this.fb.control<Date | null>(null, Validators.required),
      toDate: this.fb.control<Date | null>(null, Validators.required),
      schemeId: this.fb.nonNullable.control('', [Validators.required, NOT_BLANK, Validators.maxLength(this.limits.schemeId)]),
      description: this.fb.nonNullable.control('', [
        Validators.required,
        NOT_BLANK,
        Validators.maxLength(this.limits.description),
      ]),
      discountType: this.fb.nonNullable.control('', Validators.required),
      schemeType: this.fb.nonNullable.control('', Validators.required),
      claimType: this.fb.nonNullable.control('', Validators.required),
      claimPercentage: this.fb.control<number | null>({ value: 100, disabled: true }, [
        Validators.required,
        Validators.min(0.01),
        Validators.max(100),
      ]),
    },
    { validators: schemePeriodValidator('fromDate', 'toDate', () => this.store.today()) },
  );

  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  protected readonly saving = signal(false);
  protected readonly attempted = signal(false);
  protected readonly refusal = signal<(TradeOfferRefusal & { field: SetupField | null; existing: string | null }) | null>(
    null,
  );
  /** After a create: the new sequence id, and what a copy managed. */
  protected readonly created = signal<{ sequenceId: string; copied: CopyOutcome[] | null; copying: boolean } | null>(
    null,
  );
  protected readonly dirty = signal(false);

  protected readonly presets = computed(() => periodPresets(this.store.today()));
  protected readonly isNew = this.store.isNew;
  protected readonly editable = this.store.editable;

  protected readonly toBounds = computed(() => {
    const from = this.value().fromDate;
    return { min: from ?? this.store.today(), max: from ? endOfMonth(from) : null };
  });

  protected readonly days = computed(() => {
    const { fromDate, toDate } = this.value();
    return fromDate && toDate && toDate >= fromDate ? daysIn({ from: fromDate, to: toDate }) : null;
  });

  protected readonly claimType = computed(
    () => this.claimTypes.find((type) => type.code === this.value().claimType) ?? null,
  );

  /** An existing scheme that started before today: its setup can only be saved with new dates. */
  protected readonly startedAlready = computed(() => {
    const scheme = this.store.scheme();
    const from = parseIsoDate(scheme?.fromDate);
    return !!scheme && scheme.isEditable && !!from && from < this.store.today();
  });

  protected readonly headFlag = computed(() => {
    if (this.isNew()) {
      return { text: 'Not created yet', tone: 'muted' as const };
    }
    if (!this.editable()) {
      return { text: 'Read-only', tone: 'muted' as const };
    }
    return this.dirty() ? { text: 'Unsaved changes', tone: 'warn' as const } : { text: 'Saved', tone: 'ok' as const };
  });

  protected readonly invalidCount = computed(() => {
    this.status();
    this.value();
    const fields = Object.values(this.form.controls).filter((control) => control.enabled && control.invalid).length;
    return fields + (this.form.errors ? 1 : 0);
  });

  /** Which scheme (or copy) the form was last filled from, so edits survive other cards' saves. */
  private filledFrom = '';

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncDirty());

    // Claim percentage is WD's alone; every other claim type is saved at 100.
    this.form.controls.claimType.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncClaimPercentage());

    // The To Date follows the From Date: kept inside its month, otherwise the month's end.
    this.form.controls.fromDate.valueChanges.pipe(takeUntilDestroyed()).subscribe((from) => {
      if (!from) {
        return;
      }
      const to = this.form.controls.toDate.value;
      const next = followingToDate(from, to);
      if (!to || next.getTime() !== to.getTime()) {
        this.form.controls.toDate.setValue(next);
      }
    });

    // Fill the form from the open scheme, the scheme being copied, or the defaults — but
    // never over edits: another card's save changes the scheme without touching this part.
    effect(() => {
      const scheme = this.store.scheme();
      const source = this.store.copySource();
      this.store.revision();
      untracked(() => this.fill(scheme, source));
    });

    // Read-only once sent or expired.
    effect(() => {
      const editable = this.editable();
      untracked(() => {
        if (editable) {
          this.form.enable({ emitEvent: false });
          this.syncClaimPercentage();
        } else {
          this.form.disable({ emitEvent: false });
        }
      });
    });

    this.store.registerSaver('setup', () => {
      if (!this.editable() || this.saving() || (!this.isNew() && !this.form.dirty)) {
        return false;
      }
      this.save();
      return true;
    });
  }

  ngOnDestroy(): void {
    this.store.unregisterSaver('setup');
    this.store.setDirty('setup', false);
  }

  // ─── Filling ────────────────────────────────────────────────────────────────

  private fill(scheme: TradeOfferScheme | null, source: TradeOfferScheme | null): void {
    const key = scheme ? `scheme:${scheme.sequenceId}` : source ? `copy:${source.sequenceId}` : 'new';
    if (key === this.filledFrom && this.form.dirty) {
      return;
    }
    const keyChanged = key !== this.filledFrom;
    this.filledFrom = key;
    if (keyChanged) {
      this.attempted.set(false);
      this.refusal.set(null);
      if (!scheme) {
        this.created.set(null);
      }
    }

    if (scheme) {
      this.patch(scheme, { from: parseIsoDate(scheme.fromDate), to: parseIsoDate(scheme.toDate) });
    } else if (source) {
      this.patch(source, this.copiedPeriod(source));
    } else {
      const today = this.store.today();
      this.form.reset(
        {
          fromDate: today,
          toDate: endOfMonth(today),
          schemeId: '',
          description: '',
          discountType: this.only(this.discountTypes),
          schemeType: this.only(this.schemeTypes),
          claimType: this.defaultClaimType(),
          claimPercentage: 100,
        },
        { emitEvent: false },
      );
    }
    this.syncClaimPercentage();
    this.form.markAsPristine();
    this.form.updateValueAndValidity();
    this.syncDirty();
  }

  private patch(scheme: TradeOfferScheme, period: { from: Date | null; to: Date | null }): void {
    this.form.reset(
      {
        fromDate: period.from,
        toDate: period.to,
        schemeId: scheme.schemeId,
        description: scheme.description,
        discountType: scheme.discountType.code,
        schemeType: scheme.schemeType.code,
        claimType: scheme.claimType.code,
        claimPercentage: dec(scheme.claimPercentage, 100),
      },
      { emitEvent: false },
    );
  }

  /** A copy keeps its source's dates while they are still open; otherwise today to the month's end. */
  private copiedPeriod(source: TradeOfferScheme): { from: Date; to: Date } {
    const today = this.store.today();
    const from = parseIsoDate(source.fromDate);
    const to = parseIsoDate(source.toDate);
    if (from && to && from >= today) {
      return { from, to };
    }
    if (to && to >= today && sameMonth(today, to)) {
      return { from: today, to };
    }
    return { from: today, to: endOfMonth(today) };
  }

  private only(options: readonly { code: string }[]): string {
    return options.length === 1 ? options[0].code : '';
  }

  private defaultClaimType(): string {
    const remembered = readPreference(this.menuAccess.userId(), 'claimType');
    const codes = this.claimTypes.map((type) => type.code);
    if (codes.includes(remembered)) {
      return remembered;
    }
    return codes.includes(USUAL_CLAIM_TYPE) ? USUAL_CLAIM_TYPE : this.only(this.claimTypes);
  }

  private syncClaimPercentage(): void {
    const control = this.form.controls.claimPercentage;
    const editable = this.editable() && !!this.claimTypes.find((type) => type.code === this.form.controls.claimType.value)?.claimPercentageEditable;
    if (editable && control.disabled) {
      control.enable({ emitEvent: false });
    } else if (!editable) {
      if (control.value !== 100) {
        control.setValue(100, { emitEvent: false });
      }
      if (control.enabled) {
        control.disable({ emitEvent: false });
      }
    }
  }

  private syncDirty(): void {
    const dirty = this.form.dirty && this.editable();
    this.dirty.set(dirty);
    this.store.setDirty('setup', dirty);
  }

  // ─── Dates ──────────────────────────────────────────────────────────────────

  protected applyPreset(range: DateRange): void {
    this.form.patchValue({ fromDate: range.from, toDate: range.to });
    this.form.controls.fromDate.markAsDirty();
    this.form.controls.fromDate.markAsTouched();
    this.syncDirty();
  }

  protected isPreset(range: DateRange): boolean {
    const { fromDate, toDate } = this.value();
    return (
      !!fromDate &&
      !!toDate &&
      startOfDay(fromDate).getTime() === range.from.getTime() &&
      startOfDay(toDate).getTime() === range.to.getTime()
    );
  }

  protected periodError(): string {
    const refused = this.refusal();
    if (refused?.field === 'period') {
      return refused.message;
    }
    const { fromDate, toDate } = this.form.controls;
    const shown = this.attempted() || fromDate.touched || toDate.touched || this.form.dirty;
    if (!shown) {
      return '';
    }
    if (fromDate.invalid || toDate.invalid) {
      return 'Pick the From Date and the To Date.';
    }
    if (this.form.hasError('periodOrder')) {
      return 'The To Date is before the From Date.';
    }
    if (this.form.hasError('periodMonths')) {
      return 'A scheme runs within one month: pick a To Date in the same month.';
    }
    if (this.form.hasError('periodPast')) {
      return `A scheme may not start before today, ${formatDate(this.store.today())}.`;
    }
    return '';
  }

  // ─── Validation display ─────────────────────────────────────────────────────

  protected showError(control: AbstractControl): boolean {
    return control.enabled && control.invalid && (control.touched || this.attempted());
  }

  protected fieldRefusal(field: SetupField): string {
    const refused = this.refusal();
    return refused?.field === field ? refused.message : '';
  }

  protected lengthError(control: AbstractControl, max: number, label: string): string {
    if (control.hasError('maxlength')) {
      return `Use at most ${max} characters.`;
    }
    return `Enter the ${label}.`;
  }

  // ─── Saving ─────────────────────────────────────────────────────────────────

  protected save(): void {
    if (this.saving() || !this.editable()) {
      return;
    }
    this.attempted.set(true);
    this.refusal.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      queueMicrotask(() =>
        this.host.nativeElement.querySelector('[data-invalid="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }

    const value = this.form.getRawValue();
    const claimType = this.claimType();
    const request: SaveTradeOfferSchemeRequest = {
      fromDate: toIsoDate(value.fromDate!),
      toDate: toIsoDate(value.toDate!),
      schemeId: value.schemeId.trim(),
      description: value.description.trim(),
      discountType: value.discountType,
      schemeType: value.schemeType,
      claimType: value.claimType,
      claimPercentage: claimType?.claimPercentageEditable ? value.claimPercentage : null,
    };

    const sequenceId = this.store.sequenceId();
    this.saving.set(true);
    const call = sequenceId ? this.api.update(sequenceId, request) : this.api.create(request);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (scheme) => {
        this.saving.set(false);
        writePreference(this.menuAccess.userId(), 'claimType', value.claimType);
        if (sequenceId) {
          this.onUpdated(scheme);
        } else {
          this.onCreated(scheme);
        }
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const refused = refusalOf(error, 'The setup could not be saved.');
        this.refusal.set({
          ...refused,
          field: FIELD_OF[refused.code] ?? null,
          existing: refused.code === 'duplicate_submit' ? sequenceIdIn(refused.message) : null,
        });
        if (isStaleScheme(refused)) {
          this.store.reload();
        }
      },
    });
  }

  private onUpdated(scheme: TradeOfferScheme): void {
    this.form.markAsPristine();
    this.filledFrom = '';
    this.store.apply(scheme);
    this.attempted.set(false);
    this.notifications.success(`Setup of scheme ${scheme.sequenceId} saved.`, 'Saved');
  }

  private onCreated(scheme: TradeOfferScheme): void {
    const source = this.store.copySource();
    this.form.markAsPristine();
    this.store.setDirty('setup', false);
    this.store.copySource.set(null);
    this.store.apply(scheme);
    this.attempted.set(false);
    this.created.set({ sequenceId: scheme.sequenceId, copied: null, copying: !!source });
    void this.router.navigate([], { relativeTo: this.route, queryParams: { scheme: scheme.sequenceId } });

    if (source) {
      this.store.replayCopy(source, scheme).subscribe((outcomes) => {
        this.created.set({ sequenceId: scheme.sequenceId, copied: outcomes, copying: false });
        const failed = outcomes.filter((outcome) => !outcome.ok).length;
        if (failed === 0) {
          this.notifications.success(
            `Scheme ${scheme.sequenceId} created with ${source.sequenceId}'s slab and criteria. Pick its budget shell under Discount Mechanics.`,
            'Created',
          );
        } else {
          this.notifications.warn(
            `Scheme ${scheme.sequenceId} created, but ${failed} of ${outcomes.length} parts did not copy. The Setup card says which.`,
            'Partly copied',
          );
        }
      });
      return;
    }

    this.notifications.success(`Scheme ${scheme.sequenceId} created. Add its slab next.`, 'Created');
    // Legacy's Select Criteria gave every scheme a Perfect Store criterion before any other.
    this.api
      .seedCriteria(scheme.sequenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (seeded) => this.store.apply(seeded), error: () => undefined });
  }

  protected openExisting(sequenceId: string): void {
    this.form.markAsPristine();
    this.syncDirty();
    void this.router.navigate([], { relativeTo: this.route, queryParams: { scheme: sequenceId } });
  }

  protected discard(): void {
    this.filledFrom = '';
    this.form.markAsPristine();
    this.fill(this.store.scheme(), this.store.copySource());
    this.refusal.set(null);
    this.attempted.set(false);
  }
}
