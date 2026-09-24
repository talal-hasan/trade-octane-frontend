import { Component, DestroyRef, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

import { dec } from '../../../../core/api/api.types';
import { TradeOfferBudgetShell, TradeOfferMechanicsFigures } from '../../../../core/api/initiate.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { HeadroomBarComponent } from '../../../../shared/components/headroom-bar/headroom-bar.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { TradeOffersApi } from '../../services/trade-offers.api';
import { TradeOfferStore } from '../trade-offer.store';
import {
  TradeOfferRefusal,
  databaseChoices,
  formatDate,
  formatLitres,
  formatMoney,
  formatPlain,
  isStaleScheme,
  parseIsoDate,
  refusalOf,
} from '../trade-offer.util';

interface ShellOption {
  shellCode: string;
  name: string;
  regionCode: string;
  total: number;
  allocated: number;
  available: number;
  /** Of the scheme's saved region — the only kind Check for Approval accepts. */
  ofRegion: boolean;
}

interface Figure {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}

function toOption(shell: TradeOfferBudgetShell, region: string | null): ShellOption {
  return {
    shellCode: shell.shellCode,
    name: shell.name || shell.shellCode,
    regionCode: shell.regionCode,
    total: dec(shell.totalBudget),
    allocated: dec(shell.allocatedBudget),
    available: dec(shell.availableBudget),
    ofRegion: !!region && shell.regionCode === region,
  };
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

/**
 * 4 · Discount Mechanics — gross profit per litre, total discount, volumes, ROI and uplift,
 * against a budget shell.
 *
 * Legacy computed them in the browser behind two buttons (Get Gross Profit Per Litre, Get
 * Total Discount) and saved whatever the boxes held. The server computes them now; this card
 * asks for the calculation whenever the slab, the master SKUs or the shell change, and saves
 * by naming the shell alone.
 */
@Component({
  selector: 'to-trade-offer-mechanics-card',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, ButtonModule, SelectModule, HeadroomBarComponent],
  templateUrl: './mechanics-card.component.html',
  styleUrl: './mechanics-card.component.scss',
})
export class MechanicsCardComponent implements OnDestroy {
  protected readonly store = inject(TradeOfferStore);
  private readonly api = inject(TradeOffersApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;

  protected readonly locked = this.store.isNew;
  protected readonly editable = this.store.editable;
  // ─── Posted to ───────────────────────────────────────────────────────────────
  // Legacy's Database dropdown: Salesflo today, IBY once schemes move there.

  protected readonly databases = computed(() => databaseChoices(this.store.catalogue(), this.store.scheme()?.mechanics?.database));
  protected readonly databaseControl = new FormControl('', { nonNullable: true });
  private readonly pickedDatabase = toSignal(this.databaseControl.valueChanges, { initialValue: '' });
  /** The saved code as a string, so a write that leaves it alone does not reset the pick. */
  private readonly savedDatabase = computed(() => this.store.scheme()?.mechanics?.database?.code ?? '');
  private readonly defaultDatabase = computed(() => this.databases().defaultCode);
  protected readonly databaseName = computed(
    () => this.databases().choices.find((choice) => choice.code === this.pickedDatabase())?.name ?? '',
  );
  /** A different system picked than the saved mechanics name — only meaningful once the server lists them. */
  protected readonly databaseChanged = computed(
    () => this.databases().listed && !!this.savedDatabase() && this.pickedDatabase() !== this.savedDatabase(),
  );

  protected readonly shellControl = new FormControl('', { nonNullable: true });

  protected readonly shellOptions = computed(() => {
    const region = this.store.requirements().regionCode;
    return (this.store.shells() ?? [])
      .map((shell) => toOption(shell, region))
      .sort((a, b) => Number(b.ofRegion) - Number(a.ofRegion) || b.available - a.available);
  });

  protected readonly selected = computed(
    () => this.shellOptions().find((option) => option.shellCode === this.store.shellCode()) ?? null,
  );

  protected readonly saved = computed(() => this.store.scheme()?.mechanics ?? null);

  /** What the card shows: the calculation, or — read-only, or before one arrives — what is saved. */
  protected readonly shown = computed(() => this.store.calculation() ?? this.saved());

  protected readonly figures = computed<Figure[]>(() => {
    const mechanics = this.shown();
    return mechanics ? this.toFigures(mechanics.figures) : [];
  });

  protected readonly totalDiscount = computed(() => {
    const mechanics = this.shown();
    return mechanics ? dec(mechanics.figures.totalDiscount) : 0;
  });

  protected readonly exceeds = computed(() => !!this.store.calculation()?.exceedsAvailableBudget);

  protected readonly regionMismatch = computed(() => {
    const selected = this.selected();
    const region = this.store.requirements().regionCode;
    return !!selected && !!region && selected.regionCode !== region;
  });

  /** Saved against the shell and system picked, and the slab has not changed since. */
  protected readonly upToDate = computed(() => {
    const saved = this.saved();
    return (
      !!saved && saved.budgetShellCode === this.store.shellCode() && !this.databaseChanged() && !this.store.outdated()
    );
  });

  protected readonly month = computed(() => {
    const from = parseIsoDate(this.store.scheme()?.fromDate);
    return from ? MONTH.format(from) : 'the scheme month';
  });

  protected readonly headFlag = computed(() => {
    if (this.locked()) {
      return { text: 'Waiting for the setup', tone: 'muted' as const };
    }
    const saved = this.saved();
    if (!saved) {
      return { text: this.editable() ? 'Not saved' : 'None', tone: this.editable() ? ('warn' as const) : ('muted' as const) };
    }
    if (this.store.outdated()) {
      return { text: 'Out of date', tone: 'warn' as const };
    }
    if (this.editable() && saved.budgetShellCode !== this.store.shellCode()) {
      return { text: 'Unsaved shell', tone: 'warn' as const };
    }
    if (this.editable() && this.databaseChanged()) {
      return { text: 'Unsaved changes', tone: 'warn' as const };
    }
    return { text: 'Saved', tone: 'ok' as const };
  });

  protected readonly saving = signal(false);
  protected readonly refusal = signal<TradeOfferRefusal | null>(null);

  protected readonly canSave = computed(
    () =>
      this.editable() &&
      !!this.store.shellCode() &&
      !!this.store.calculation() &&
      !this.store.calcLoading() &&
      !this.databases().choices.find((choice) => choice.code === this.pickedDatabase())?.disabled &&
      !this.exceeds() &&
      !this.upToDate() &&
      !this.saving(),
  );

  constructor() {
    // The control mirrors the store, which may pick a shell itself (the saved one, the only one).
    effect(() => {
      const code = this.store.shellCode();
      untracked(() => {
        if (this.shellControl.value !== code) {
          this.shellControl.setValue(code, { emitEvent: false });
        }
      });
    });
    this.shellControl.valueChanges.pipe(takeUntilDestroyed()).subscribe((code) => {
      this.store.shellCode.set(code ?? '');
      this.refusal.set(null);
    });

    // Posted To starts at what the mechanics were saved with, or the server's default.
    effect(() => {
      const code = this.savedDatabase() || this.defaultDatabase();
      this.store.sequenceId();
      untracked(() => this.databaseControl.setValue(code));
    });
    this.databaseControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.refusal.set(null));

    effect(() => {
      const enabled = this.editable() && !this.locked();
      untracked(() => {
        for (const control of [this.shellControl, this.databaseControl]) {
          if (enabled) {
            control.enable({ emitEvent: false });
          } else {
            control.disable({ emitEvent: false });
          }
        }
      });
    });

    // Only a deliberate change of shell or system is unsaved work; a shell picked for a scheme
    // without mechanics is a default, and must not make leaving the page ask for confirmation.
    effect(() => {
      const saved = this.saved();
      const code = this.store.shellCode();
      const unsaved =
        this.editable() && !!saved && ((!!code && saved.budgetShellCode !== code) || this.databaseChanged());
      untracked(() => this.store.setDirty('mechanics', unsaved));
    });

    this.store.registerSaver('mechanics', () => {
      if (!this.canSave()) {
        return false;
      }
      this.save();
      return true;
    });
  }

  ngOnDestroy(): void {
    this.store.unregisterSaver('mechanics');
    this.store.setDirty('mechanics', false);
  }

  private toFigures(figures: TradeOfferMechanicsFigures): Figure[] {
    const roi = dec(figures.roi);
    const uplift = dec(figures.uplift);
    return [
      { label: 'Gross profit per litre', value: formatMoney(dec(figures.grossProfitPerLitre)) },
      { label: 'Total discount', value: formatMoney(dec(figures.totalDiscount)) },
      { label: 'Activated volume', value: formatLitres(dec(figures.activatedVolume)) },
      { label: 'Baseline volume (P-1)', value: formatLitres(dec(figures.baselineVolume)) },
      { label: 'Post scheme DIP (P+1)', value: formatLitres(dec(figures.postSchemeDip)) },
      { label: 'Incremental volume', value: formatLitres(dec(figures.incrementalVolume)) },
      { label: 'Incremental GP', value: formatMoney(dec(figures.incrementalGrossProfit)) },
      { label: 'Incremental profit', value: formatMoney(dec(figures.incrementalProfit)) },
      { label: 'ROI', value: `${formatPlain(roi)}%`, tone: roi > 0 ? 'good' : roi < 0 ? 'bad' : undefined },
      { label: 'Uplift', value: `${formatPlain(uplift)}%`, tone: uplift > 0 ? 'good' : uplift < 0 ? 'bad' : undefined },
    ];
  }

  protected save(): void {
    const sequenceId = this.store.sequenceId();
    const shellCode = this.store.shellCode();
    if (!sequenceId || !shellCode || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    this.api
      .saveMechanics(sequenceId, shellCode, this.databases().listed ? this.pickedDatabase() || null : null)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (scheme) => {
          this.saving.set(false);
          this.store.apply(scheme);
          this.notifications.success('Discount mechanics saved against the budget shell.', 'Saved');
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const refused = refusalOf(error, 'The mechanics could not be saved.');
          this.refusal.set(refused);
          if (isStaleScheme(refused)) {
            this.store.reload();
          } else if (refused.code === 'discount_exceeds_budget' || refused.code === 'shell_not_available') {
            // Someone else took from the shell meanwhile: show its budget as it is now.
            this.store.retryShells();
            this.store.recalculate();
          }
        },
      });
  }
}
