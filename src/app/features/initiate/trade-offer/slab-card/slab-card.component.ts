import { Component, DestroyRef, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { map } from 'rxjs';

import { int } from '../../../../core/api/api.types';
import { SaveTradeOfferSlabRequest, TradeOfferScheme } from '../../../../core/api/initiate.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { numberRangeValidator } from '../../../../shared/validators/number-range.validator';
import { TradeOffersApi } from '../../services/trade-offers.api';
import { TradeOfferStore } from '../trade-offer.store';
import {
  QUANTITY_MAX,
  SIX_PLACE_MAX,
  TradeOfferRefusal,
  formatLitres,
  formatMoney,
  formatPlain,
  isStaleScheme,
  refusalOf,
  slabTotalDiscount,
  slabValues,
} from '../trade-offer.util';

/** The To-Qty most slabs use (55% since 2025): no upper limit in practice. */
const USUAL_TO_QUANTITY = 99_999;

/**
 * 2 · Slab — legacy's Define Scheme Slabs: one row of litres, discount, forecast and For
 * Every. Legacy made it a grid with Add Row, Edit, Update and Delete; a scheme may only ever
 * have one slab, so here it is one form that adds, then updates.
 */
@Component({
  selector: 'to-trade-offer-slab-card',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, ButtonModule, InputNumberModule, ConfirmDialogComponent],
  templateUrl: './slab-card.component.html',
  styleUrl: './slab-card.component.scss',
})
export class SlabCardComponent implements OnDestroy {
  protected readonly store = inject(TradeOfferStore);
  private readonly api = inject(TradeOffersApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly formatLitres = formatLitres;
  protected readonly formatMoney = formatMoney;
  protected readonly formatPlain = formatPlain;
  protected readonly limits = { quantity: QUANTITY_MAX, sixPlace: SIX_PLACE_MAX };

  protected readonly form = this.fb.group(
    {
      fromQuantity: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(QUANTITY_MAX)]),
      toQuantity: this.fb.control<number | null>(null, [Validators.required, Validators.min(0), Validators.max(QUANTITY_MAX)]),
      discountValue: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(0),
        Validators.max(SIX_PLACE_MAX),
      ]),
      forEvery: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(0.000001),
        Validators.max(SIX_PLACE_MAX),
      ]),
      forecastLimit: this.fb.control<number | null>(null, [
        Validators.required,
        Validators.min(0),
        Validators.max(QUANTITY_MAX),
      ]),
    },
    { validators: numberRangeValidator('fromQuantity', 'toQuantity') },
  );

  protected readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  protected readonly saving = signal(false);
  protected readonly deleting = signal(false);
  protected readonly confirmDelete = signal(false);
  protected readonly attempted = signal(false);
  protected readonly refusal = signal<TradeOfferRefusal | null>(null);
  protected readonly dirty = signal(false);

  protected readonly slab = this.store.slab;
  protected readonly locked = this.store.isNew;
  protected readonly editable = this.store.editable;

  /** The discount this slab gives, as Get Total Discount computes it. */
  protected readonly preview = computed(() => {
    const { discountValue, forEvery, forecastLimit } = this.value();
    return slabTotalDiscount(discountValue, forEvery, forecastLimit);
  });

  /** The offer in words: "PKR 24 off every 4.8 L bought, from 4.8 L up to 99,999 L". */
  protected readonly readback = computed(() => {
    const { discountValue, forEvery, fromQuantity, toQuantity } = this.value();
    if (discountValue === null || !forEvery) {
      return null;
    }
    return {
      discount: `PKR ${formatPlain(discountValue)}`,
      every: formatLitres(forEvery),
      range:
        fromQuantity !== null && toQuantity !== null
          ? { from: formatLitres(fromQuantity), to: formatLitres(toQuantity) }
          : null,
    };
  });

  protected readonly headFlag = computed(() => {
    if (this.locked()) {
      return { text: 'Waiting for the setup', tone: 'muted' as const };
    }
    if (!this.slab()) {
      return { text: this.editable() ? 'Not added' : 'None', tone: this.editable() ? ('warn' as const) : ('muted' as const) };
    }
    if (this.dirty()) {
      return { text: 'Unsaved changes', tone: 'warn' as const };
    }
    return { text: 'Saved', tone: 'ok' as const };
  });

  /** While true, From-Qty follows For Every (77% of slabs start at one unit). Typing in it stops that. */
  private fromFollows = true;
  private syncing = false;
  private filledFrom = '';

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.syncDirty());

    this.form.controls.forEvery.valueChanges.pipe(takeUntilDestroyed()).subscribe((forEvery) => {
      if (this.fromFollows && forEvery != null) {
        this.syncing = true;
        this.form.controls.fromQuantity.setValue(forEvery);
        this.syncing = false;
      }
    });
    this.form.controls.fromQuantity.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (!this.syncing) {
        this.fromFollows = false;
      }
    });

    effect(() => {
      const scheme = this.store.scheme();
      this.store.revision();
      untracked(() => this.fill(scheme));
    });

    effect(() => {
      const enabled = this.editable() && !this.locked();
      untracked(() => (enabled ? this.form.enable({ emitEvent: false }) : this.form.disable({ emitEvent: false })));
    });

    this.store.registerSaver('slab', () => {
      if (this.locked() || !this.editable() || this.saving() || !this.form.dirty) {
        return false;
      }
      this.save();
      return true;
    });
  }

  ngOnDestroy(): void {
    this.store.unregisterSaver('slab');
    this.store.setDirty('slab', false);
  }

  private fill(scheme: TradeOfferScheme | null): void {
    const slab = scheme?.slabs[0] ?? null;
    const key = `${scheme?.sequenceId ?? 'new'}|${slab ? int(slab.serialNo) : 'none'}`;
    if (key === this.filledFrom && this.form.dirty) {
      return;
    }
    if (key !== this.filledFrom) {
      this.attempted.set(false);
      this.refusal.set(null);
    }
    this.filledFrom = key;
    const values = slabValues(slab);
    this.syncing = true;
    this.form.reset(
      values ?? {
        fromQuantity: null,
        toQuantity: USUAL_TO_QUANTITY,
        discountValue: null,
        forEvery: null,
        forecastLimit: null,
      },
      { emitEvent: false },
    );
    this.syncing = false;
    this.fromFollows = !values || values.fromQuantity === values.forEvery;
    this.form.updateValueAndValidity();
    this.syncDirty();
  }

  private syncDirty(): void {
    const dirty = this.form.dirty && this.editable() && !this.locked();
    this.dirty.set(dirty);
    this.store.setDirty('slab', dirty);
  }

  protected showError(control: AbstractControl): boolean {
    return control.enabled && control.invalid && (control.touched || this.attempted());
  }

  protected rangeError(): boolean {
    return this.form.hasError('numberRange') && (this.attempted() || this.form.controls.toQuantity.touched);
  }

  // ─── Saving ─────────────────────────────────────────────────────────────────

  protected save(): void {
    const sequenceId = this.store.sequenceId();
    if (!sequenceId || this.saving()) {
      return;
    }
    this.attempted.set(true);
    this.refusal.set(null);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const request: SaveTradeOfferSlabRequest = {
      fromQuantity: value.fromQuantity!,
      toQuantity: value.toQuantity!,
      discountValue: value.discountValue!,
      forecastLimit: value.forecastLimit!,
      forEvery: value.forEvery!,
    };
    const slab = this.slab();
    this.saving.set(true);
    const call = slab
      ? this.api.updateSlab(sequenceId, int(slab.serialNo), request)
      : this.api.addSlab(sequenceId, request);
    call.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (scheme) => {
        this.saving.set(false);
        this.form.markAsPristine();
        this.filledFrom = '';
        this.store.apply(scheme);
        this.notifications.success(
          slab ? 'Slab updated. The mechanics are recalculated from it.' : 'Slab added. Add the criteria next.',
          'Saved',
        );
      },
      error: (error: unknown) => this.onRefused(error),
    });
  }

  protected askDelete(): void {
    if (this.slab() && !this.deleting()) {
      this.confirmDelete.set(true);
    }
  }

  protected deleteSlab(): void {
    const sequenceId = this.store.sequenceId();
    const slab = this.slab();
    this.confirmDelete.set(false);
    if (!sequenceId || !slab) {
      return;
    }
    this.deleting.set(true);
    this.refusal.set(null);
    this.api
      .deleteSlab(sequenceId, int(slab.serialNo))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (scheme) => {
          this.deleting.set(false);
          this.form.markAsPristine();
          this.filledFrom = '';
          this.store.apply(scheme);
          this.notifications.success('Slab deleted.', 'Deleted');
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.onRefused(error);
        },
      });
  }

  private onRefused(error: unknown): void {
    this.saving.set(false);
    const refused = refusalOf(error, 'The slab could not be saved.');
    this.refusal.set(refused);
    if (isStaleScheme(refused) || refused.code === 'slab_exists' || refused.code === 'slab_not_found') {
      this.store.reload();
    }
  }

  protected discard(): void {
    this.filledFrom = '';
    this.form.markAsPristine();
    this.fill(this.store.scheme());
  }

  protected readonly deleteDetails = computed(() => {
    const slab = slabValues(this.slab());
    if (!slab) {
      return [];
    }
    return [
      { label: 'Litres', value: `${formatPlain(slab.fromQuantity)} – ${formatPlain(slab.toQuantity)}` },
      { label: 'Discount', value: `PKR ${formatPlain(slab.discountValue)} per ${formatLitres(slab.forEvery)}` },
      { label: 'Forecast', value: formatLitres(slab.forecastLimit) },
    ];
  });
}
