import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, catchError, concatMap, debounceTime, distinctUntilChanged, from, map, of, switchMap, tap, toArray } from 'rxjs';

import { dec } from '../../../core/api/api.types';
import {
  SubmitTradeOfferResponse,
  TradeOfferApprovalCheck,
  TradeOfferBudgetShell,
  TradeOfferCatalogueResponse,
  TradeOfferMechanics,
  TradeOfferScheme,
} from '../../../core/api/initiate.models';
import { TradeOffersApi } from '../services/trade-offers.api';
import {
  CRITERION,
  TradeOfferRefusal,
  TradeOfferStep,
  criteriaRequirements,
  findCriterion,
  mechanicsOutdated,
  parseIsoDate,
  refusalOf,
  slabValues,
  startOfDay,
} from './trade-offer.util';

/** What copying a scheme into a new one managed, step by step. */
export interface CopyOutcome {
  label: string;
  ok: boolean;
  message?: string;
}

/** One write of a copy: the slab, a criterion, the Perfect Store default. */
interface CopyStep {
  label: string;
  run: () => Observable<TradeOfferScheme>;
}

/** A save a card offers to Ctrl/⌘+S. Returns false when the card had nothing to save. */
type Saver = () => boolean;

/**
 * The open scheme and everything derived from it, shared by the five cards and the summary.
 *
 * Provided by the page, so it lives exactly as long as the screen. Every write answers with
 * the whole scheme; `apply` puts it here and bumps `revision`, which is what the budget
 * shells, the calculation and the approval check follow — so a save never costs a re-read of
 * the scheme, and nothing downstream is left showing figures for a slab that has changed.
 */
@Injectable()
export class TradeOfferStore {
  private readonly api = inject(TradeOffersApi);
  private readonly destroyRef = inject(DestroyRef);

  // ─── Reference data ─────────────────────────────────────────────────────────

  readonly catalogue = signal<TradeOfferCatalogueResponse | null>(null);
  readonly catalogueFailed = signal(false);

  /** The server's date: a scheme may not start before it. */
  readonly today = computed(() => parseIsoDate(this.catalogue()?.today) ?? startOfDay(new Date()));

  // ─── The scheme ─────────────────────────────────────────────────────────────

  readonly scheme = signal<TradeOfferScheme | null>(null);
  /** The sequence id being read, while it is. */
  readonly opening = signal<string | null>(null);
  readonly openFailed = signal<TradeOfferRefusal | null>(null);
  /** Bumped by every change a write made. */
  readonly revision = signal(0);
  /** The scheme a new one is being copied from; cleared once the copy is created or abandoned. */
  readonly copySource = signal<TradeOfferScheme | null>(null);
  /** Set by Send for Approval; the approval card shows it as a receipt. */
  readonly submitted = signal<SubmitTradeOfferResponse | null>(null);

  readonly sequenceId = computed(() => this.scheme()?.sequenceId ?? null);
  readonly isNew = computed(() => !this.scheme());
  readonly editable = computed(() => this.scheme()?.isEditable ?? true);
  readonly slab = computed(() => this.scheme()?.slabs[0] ?? null);
  readonly slabFigures = computed(() => slabValues(this.slab()));
  readonly requirements = computed(() => criteriaRequirements(this.scheme()?.criteria ?? []));
  readonly outdated = computed(() => {
    const scheme = this.scheme();
    return !!scheme && mechanicsOutdated(scheme);
  });
  readonly hasPerfectStore = computed(() => !!findCriterion(this.scheme()?.criteria ?? [], CRITERION.perfectStore));

  // ─── Budget shells and the calculation ──────────────────────────────────────

  readonly shells = signal<TradeOfferBudgetShell[] | null>(null);
  readonly shellsLoading = signal(false);
  readonly shellsFailed = signal(false);
  private readonly shellsReload = signal(0);

  /** The shell picked in Discount Mechanics — saved or not. */
  readonly shellCode = signal('');
  readonly calculation = signal<TradeOfferMechanics | null>(null);
  readonly calcLoading = signal(false);
  readonly calcError = signal<TradeOfferRefusal | null>(null);
  private readonly calcReload = signal(0);

  /** Only a scheme with a slab and a master SKU can be calculated; anything else is a sure 400. */
  readonly calculable = computed(
    () => this.editable() && !!this.slab() && this.requirements().masterSkuOk && !!this.sequenceId(),
  );

  readonly selectedShell = computed(() => this.shells()?.find((shell) => shell.shellCode === this.shellCode()) ?? null);

  /** Saved mechanics, against the shell picked, still matching the slab and within budget. */
  readonly mechanicsSaved = computed(() => {
    const mechanics = this.scheme()?.mechanics;
    return !!mechanics && !this.outdated() && !mechanics.exceedsAvailableBudget;
  });

  // ─── The approval check ─────────────────────────────────────────────────────

  readonly check = signal<{ revision: number; result: TradeOfferApprovalCheck } | null>(null);
  readonly checkLoading = signal(false);
  readonly checkError = signal<TradeOfferRefusal | null>(null);
  private readonly checkRequested = signal(0);

  /** Everything this screen can see is in place, so the check is worth running unasked. */
  readonly locallyReady = computed(() => {
    const requirements = this.requirements();
    return (
      this.editable() &&
      !!this.slab() &&
      requirements.regionOk &&
      requirements.masterSkuOk &&
      requirements.brandOk &&
      this.mechanicsSaved()
    );
  });

  /** The check's answer, only while it is about the scheme as it stands. */
  readonly currentCheck = computed(() => {
    const check = this.check();
    return check && check.revision === this.revision() ? check.result : null;
  });

  // ─── Unsaved work and shortcuts ─────────────────────────────────────────────

  private readonly dirtyParts = signal<Readonly<Record<string, boolean>>>({});
  readonly hasUnsavedChanges = computed(() => Object.values(this.dirtyParts()).some(Boolean));
  private readonly savers = new Map<TradeOfferStep, Saver>();

  /** The step the screen last scrolled to on request, for a moment's highlight. */
  readonly highlighted = signal<TradeOfferStep | null>(null);
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.loadCatalogue();

    // Budget shells depend on the month the scheme starts in and its claim type.
    toObservable(
      computed(() => {
        const scheme = this.scheme();
        return scheme && scheme.isEditable
          ? `${scheme.sequenceId}|${scheme.fromDate ?? ''}|${scheme.claimType.code}|${this.shellsReload()}`
          : '';
      }),
    )
      .pipe(
        distinctUntilChanged(),
        switchMap((key) => {
          const sequenceId = this.sequenceId();
          this.shellsFailed.set(false);
          if (!key || !sequenceId) {
            this.shells.set(null);
            this.shellsLoading.set(false);
            return EMPTY;
          }
          this.shellsLoading.set(true);
          return this.api.budgetShells(sequenceId).pipe(
            tap((shells) => {
              this.shells.set(shells);
              this.shellsLoading.set(false);
              this.pickDefaultShell();
            }),
            catchError(() => {
              this.shellsLoading.set(false);
              this.shellsFailed.set(true);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // The calculation follows the saved slab and criteria (revision) and the shell picked.
    toObservable(
      computed(() =>
        this.calculable()
          ? `${this.sequenceId()}|${this.revision()}|${this.shellCode()}|${this.calcReload()}`
          : '',
      ),
    )
      .pipe(
        distinctUntilChanged(),
        debounceTime(0),
        switchMap((key) => {
          const sequenceId = this.sequenceId();
          this.calcError.set(null);
          if (!key || !sequenceId) {
            this.calculation.set(null);
            this.calcLoading.set(false);
            return EMPTY;
          }
          this.calcLoading.set(true);
          return this.api.calculate(sequenceId, this.shellCode() || null).pipe(
            tap((result) => {
              this.calculation.set(result);
              this.calcLoading.set(false);
            }),
            catchError((error: unknown) => {
              this.calculation.set(null);
              this.calcLoading.set(false);
              this.calcError.set(refusalOf(error, 'The mechanics could not be calculated.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // The approval check: on request, and by itself once everything looks in place. A check
    // already on screen is re-run after every change, so it never describes an older scheme.
    toObservable(
      computed(() => {
        const sequenceId = this.sequenceId();
        const wanted = this.checkRequested() > 0 || this.locallyReady();
        return sequenceId && this.editable() && wanted ? `${sequenceId}|${this.revision()}|${this.checkRequested()}` : '';
      }),
    )
      .pipe(
        distinctUntilChanged(),
        debounceTime(150),
        switchMap((key) => {
          const sequenceId = this.sequenceId();
          if (!key || !sequenceId) {
            this.checkLoading.set(false);
            return EMPTY;
          }
          const revision = this.revision();
          this.checkLoading.set(true);
          this.checkError.set(null);
          return this.api.approvalCheck(sequenceId).pipe(
            tap((result) => {
              this.check.set({ revision, result });
              this.checkLoading.set(false);
            }),
            catchError((error: unknown) => {
              this.checkLoading.set(false);
              this.checkError.set(refusalOf(error, 'The approval check could not be run.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  loadCatalogue(): void {
    this.catalogueFailed.set(false);
    this.api
      .catalogue()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogue) => this.catalogue.set(catalogue),
        error: () => this.catalogueFailed.set(true),
      });
  }

  /** Opens one of the caller's schemes. A scheme already open is not read again. */
  open(sequenceId: string): void {
    if (this.scheme()?.sequenceId === sequenceId || this.opening() === sequenceId) {
      return;
    }
    this.opening.set(sequenceId);
    this.openFailed.set(null);
    this.api
      .scheme(sequenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (scheme) => {
          if (this.opening() !== sequenceId) {
            return;
          }
          this.opening.set(null);
          this.reset();
          this.apply(scheme);
        },
        error: (error: unknown) => {
          if (this.opening() !== sequenceId) {
            return;
          }
          this.opening.set(null);
          this.openFailed.set(refusalOf(error, `Scheme ${sequenceId} could not be opened.`));
        },
      });
  }

  /** Reads the open scheme again — after a refusal saying it changed elsewhere. */
  reload(): void {
    const sequenceId = this.sequenceId();
    if (!sequenceId) {
      return;
    }
    this.api
      .scheme(sequenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (scheme) => this.apply(scheme), error: () => undefined });
  }

  /** A blank form for a new scheme, optionally filled from `copyFrom`. */
  startNew(copyFrom: TradeOfferScheme | null = null): void {
    this.opening.set(null);
    this.openFailed.set(null);
    this.reset();
    this.scheme.set(null);
    this.copySource.set(copyFrom);
    this.revision.update((value) => value + 1);
  }

  /** Puts a scheme a write returned on screen. */
  apply(scheme: TradeOfferScheme): void {
    const previous = this.scheme();
    if (previous && previous.sequenceId !== scheme.sequenceId) {
      this.reset();
    }
    this.scheme.set(scheme);
    if (!this.shellCode() && scheme.mechanics?.budgetShellCode) {
      this.shellCode.set(scheme.mechanics.budgetShellCode);
    } else if (!this.shellCode() && this.shells()) {
      // A region saved just now can make one shell the obvious choice.
      this.pickDefaultShell();
    }
    this.revision.update((value) => value + 1);
  }

  private reset(): void {
    this.shellCode.set('');
    this.calculation.set(null);
    this.calcError.set(null);
    this.check.set(null);
    this.checkError.set(null);
    this.checkRequested.set(0);
    this.submitted.set(null);
    this.dirtyParts.set({});
  }

  retryShells(): void {
    this.shellsReload.update((value) => value + 1);
  }

  recalculate(): void {
    this.calcReload.update((value) => value + 1);
  }

  runCheck(): void {
    this.checkRequested.update((value) => value + 1);
  }

  /**
   * The shell to start from: the one the mechanics were saved against, else the only one of
   * the scheme's region, else the only one there is. A pick still on the list is kept.
   */
  private pickDefaultShell(): void {
    const shells = this.shells() ?? [];
    const current = this.shellCode();
    if (current && shells.some((shell) => shell.shellCode === current)) {
      return;
    }
    const saved = this.scheme()?.mechanics?.budgetShellCode;
    if (saved && shells.some((shell) => shell.shellCode === saved)) {
      this.shellCode.set(saved);
      return;
    }
    const region = this.requirements().regionCode;
    const ofRegion = region ? shells.filter((shell) => shell.regionCode === region) : [];
    if (ofRegion.length === 1) {
      this.shellCode.set(ofRegion[0].shellCode);
    } else if (shells.length === 1) {
      this.shellCode.set(shells[0].shellCode);
    } else if (current) {
      this.shellCode.set('');
    }
  }

  // ─── Copying a scheme into a new one ────────────────────────────────────────

  /**
   * Gives a scheme just created from `source` the source's slab and criteria, one write at a
   * time — the same writes as doing it by hand, so the same rules apply. Mechanics are not
   * copied: they take budget from a shell, which is a decision for this scheme.
   */
  replayCopy(source: TradeOfferScheme, created: TradeOfferScheme): Observable<CopyOutcome[]> {
    const sequenceId = created.sequenceId;
    const steps: CopyStep[] = [];

    const slab = slabValues(source.slabs[0]);
    if (slab) {
      steps.push({ label: 'Slab', run: () => this.api.addSlab(sequenceId, slab) });
    }
    for (const criterion of source.criteria) {
      if (criterion.values.length === 0) {
        continue;
      }
      steps.push({
        label: criterion.dimension || criterion.criterion,
        run: () =>
          this.api.saveCriterion(sequenceId, criterion.criterion, {
            operator: criterion.operator,
            values: criterion.values.map((value) => value.code),
          }),
      });
    }
    if (!findCriterion(source.criteria, CRITERION.perfectStore)) {
      steps.push({ label: 'Perfect Store default', run: () => this.api.seedCriteria(sequenceId) });
    }

    return from(steps).pipe(
      concatMap((step) =>
        step.run().pipe(
          tap((scheme) => this.apply(scheme)),
          map(() => ({ label: step.label, ok: true }) as CopyOutcome),
          catchError((error: unknown) => of({ label: step.label, ok: false, message: refusalOf(error).message })),
        ),
      ),
      toArray(),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  // ─── Unsaved work, shortcuts, navigation between steps ─────────────────────

  setDirty(part: string, dirty: boolean): void {
    if (!!this.dirtyParts()[part] !== dirty) {
      this.dirtyParts.update((parts) => ({ ...parts, [part]: dirty }));
    }
  }

  registerSaver(step: TradeOfferStep, saver: Saver): void {
    this.savers.set(step, saver);
  }

  unregisterSaver(step: TradeOfferStep): void {
    this.savers.delete(step);
  }

  save(step: TradeOfferStep): boolean {
    return this.savers.get(step)?.() ?? false;
  }

  /** Scrolls a step's card into view and marks it for a moment. */
  goTo(step: TradeOfferStep): void {
    document.getElementById(`to-trade-offer-${step}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.highlighted.set(step);
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
    }
    this.highlightTimer = setTimeout(() => this.highlighted.set(null), 1600);
  }

  /** The total discount the slab gives, from the saved mechanics or the latest calculation. */
  readonly totalDiscount = computed(() => {
    const calculation = this.calculation();
    if (calculation) {
      return dec(calculation.figures.totalDiscount);
    }
    const saved = this.scheme()?.mechanics;
    return saved ? dec(saved.figures.totalDiscount) : null;
  });
}
