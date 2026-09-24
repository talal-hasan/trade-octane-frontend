import { ScrollingModule } from '@angular/cdk/scrolling';
import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { EMPTY, catchError, concatMap, distinctUntilChanged, from, map, of, switchMap, tap, toArray } from 'rxjs';

import {
  TradeOfferCriterion,
  TradeOfferCriterionOperator,
  TradeOfferOption,
} from '../../../../core/api/initiate.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { TradeOffersApi } from '../../services/trade-offers.api';
import { TradeOfferStore } from '../trade-offer.store';
import {
  CRITERION,
  CRITERION_VALUE_LENGTH,
  TradeOfferRefusal,
  isStaleScheme,
  joinedLength,
  refusalOf,
  sameCriterion,
} from '../trade-offer.util';

/** One criterion's unsaved selection. */
interface Draft {
  operator: TradeOfferCriterionOperator;
  codes: string[];
}

interface NavItem {
  key: string;
  criterion: string;
  dimension: string;
  count: number;
  operator: TradeOfferCriterionOperator;
  dirty: boolean;
  /** Carried by the scheme, but not a criterion this screen can list options for. */
  readOnly: boolean;
  tag: 'required' | 'blocks' | null;
}

/** Product criteria: the approve screen groups these apart from the outlet ones. */
const PRODUCT_CRITERIA = new Set(['prod_level2', 'prod_level4', 'prod_level6', 'master_sku']);

/** The row height of the options list; the list is virtual, so it must be fixed. */
export const OPTION_ROW = 32;

const key = (criterion: string) => criterion.toLowerCase();

/**
 * 3 · Criteria — legacy's Define Scheme Criteria: a dimension dropdown over two list boxes
 * moved between with > < >> <<, Include / Exclude, and Save.
 *
 * Here a click adds a value (no select-then-move), the selected list stays beside the
 * options, and every criterion keeps its unsaved selection while another is edited, so
 * several can be saved together. The rules Check for Approval applies to criteria — one
 * region, a master SKU, no brand — are stated above the list, from what is saved.
 */
@Component({
  selector: 'to-trade-offer-criteria-card',
  standalone: true,
  imports: [ScrollingModule, NgTemplateOutlet, ReactiveFormsModule, TablerIconComponent, ButtonModule, InputTextModule, SelectModule],
  templateUrl: './criteria-card.component.html',
  styleUrl: './criteria-card.component.scss',
})
export class CriteriaCardComponent implements OnDestroy {
  protected readonly store = inject(TradeOfferStore);
  private readonly api = inject(TradeOffersApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly optionRow = OPTION_ROW;
  protected readonly valueLimit = CRITERION_VALUE_LENGTH;

  protected readonly locked = this.store.isNew;
  protected readonly editable = this.store.editable;
  protected readonly requirements = this.store.requirements;

  // ─── Criteria and what is saved ─────────────────────────────────────────────

  private readonly catalogueCriteria = computed(() => this.store.catalogue()?.criteria ?? []);

  private readonly saved = computed(
    () => new Map((this.store.scheme()?.criteria ?? []).map((selection) => [key(selection.criterion), selection])),
  );

  protected readonly drafts = signal<ReadonlyMap<string, Draft>>(new Map());

  protected readonly active = signal<string>(CRITERION.region);

  protected readonly activeMeta = computed<TradeOfferCriterion | null>(() => {
    const active = key(this.active());
    return this.catalogueCriteria().find((criterion) => key(criterion.criterion) === active) ?? null;
  });

  protected readonly activeSaved = computed(() => this.saved().get(key(this.active())) ?? null);

  protected readonly isPop = computed(() => sameCriterion(this.active(), CRITERION.pop));

  /** The selection being edited: the draft, or what is saved. */
  protected readonly draft = computed<Draft>(() => {
    const draft = this.drafts().get(key(this.active()));
    if (draft) {
      return draft;
    }
    const saved = this.activeSaved();
    return { operator: saved?.operator ?? 'Include', codes: saved?.values.map((value) => value.code) ?? [] };
  });

  protected readonly selectedCodes = computed(() => new Set(this.draft().codes));

  protected readonly activeDirty = computed(() => this.isDirty(key(this.active())));

  protected readonly dirtyKeys = computed(() => [...this.drafts().keys()].filter((criterion) => this.isDirty(criterion)));

  protected readonly length = computed(() => joinedLength(this.draft().codes));

  protected readonly nav = computed(() => {
    const saved = this.saved();
    const drafts = this.drafts();
    const items: NavItem[] = this.catalogueCriteria().map((criterion) => {
      const criterionKey = key(criterion.criterion);
      const draft = drafts.get(criterionKey);
      const selection = saved.get(criterionKey);
      return {
        key: criterionKey,
        criterion: criterion.criterion,
        dimension: criterion.dimension,
        count: draft ? draft.codes.length : (selection?.values.length ?? 0),
        operator: draft?.operator ?? selection?.operator ?? 'Include',
        dirty: this.isDirty(criterionKey),
        readOnly: false,
        tag:
          criterionKey === key(CRITERION.region) || criterionKey === key(CRITERION.masterSku)
            ? 'required'
            : criterionKey === key(CRITERION.brand)
              ? 'blocks'
              : null,
      };
    });
    // A criterion the scheme carries that this screen cannot list (Channel, Business): shown, not edited.
    for (const selection of saved.values()) {
      if (!items.some((item) => item.key === key(selection.criterion))) {
        items.push({
          key: key(selection.criterion),
          criterion: selection.criterion,
          dimension: selection.dimension || selection.criterion,
          count: selection.values.length,
          operator: selection.operator,
          dirty: false,
          readOnly: true,
          tag: null,
        });
      }
    }
    return {
      outlets: items.filter((item) => !PRODUCT_CRITERIA.has(item.key)),
      products: items.filter((item) => PRODUCT_CRITERIA.has(item.key)),
    };
  });

  protected readonly activeReadOnly = computed(() => !this.activeMeta() && !!this.activeSaved());

  /** Legacy's text box beside the lists: every saved criterion, named. */
  protected readonly savedSummary = computed(() =>
    (this.store.scheme()?.criteria ?? []).map((selection) => ({
      key: key(selection.criterion),
      criterion: selection.criterion,
      dimension: selection.dimension || selection.criterion,
      exclude: selection.operator === 'Exclude',
      names: selection.values.map((value) => value.name || value.code),
    })),
  );

  // ─── Options ────────────────────────────────────────────────────────────────

  /** For POP: the distributor whose outlets are listed, and legacy's "Search Pop by PREV POP CODE". */
  protected readonly distributorControl = new FormControl('', { nonNullable: true });
  protected readonly distributor = toSignal(this.distributorControl.valueChanges, { initialValue: '' });
  protected readonly prevPopControl = new FormControl('', { nonNullable: true });
  protected readonly prevPop = signal('');
  protected readonly distributors = signal<TradeOfferOption[]>([]);
  protected readonly distributorsLoading = signal(false);

  private readonly options = signal<{ key: string; list: TradeOfferOption[]; index: string[] } | null>(null);
  protected readonly optionsLoading = signal(false);
  protected readonly optionsFailed = signal<string | null>(null);
  private readonly optionsReload = signal(0);
  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly search = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  /** Names seen for each criterion's codes — saved values and every option list read. */
  private readonly names = new Map<string, Map<string, string>>();
  private readonly namesVersion = signal(0);

  private readonly optionsKey = computed(() => {
    const active = key(this.active());
    if (!this.activeMeta()) {
      return '';
    }
    if (this.isPop()) {
      return this.distributor() ? `${active}|${this.distributor()}|${this.prevPop()}` : '';
    }
    return active;
  });

  protected readonly visibleOptions = computed(() => {
    const loaded = this.options();
    if (!loaded || loaded.key !== this.optionsKey()) {
      return [];
    }
    const needle = this.search().trim().toLowerCase();
    if (!needle) {
      return loaded.list;
    }
    const out: TradeOfferOption[] = [];
    for (let index = 0; index < loaded.list.length; index++) {
      if (loaded.index[index].includes(needle)) {
        out.push(loaded.list[index]);
      }
    }
    return out;
  });

  protected readonly optionCount = computed(() => {
    const loaded = this.options();
    return loaded && loaded.key === this.optionsKey() ? loaded.list.length : 0;
  });

  protected readonly selectedList = computed(() => {
    this.namesVersion();
    const names = this.names.get(key(this.active()));
    return this.draft().codes.map((code) => ({ code, name: names?.get(code) || code }));
  });

  // ─── Saving ─────────────────────────────────────────────────────────────────

  protected readonly saving = signal<string | null>(null);
  protected readonly seeding = signal(false);
  protected readonly refusal = signal<(TradeOfferRefusal & { criterion: string }) | null>(null);

  constructor() {
    // Names of saved values, for the selected list.
    effect(() => {
      const criteria = this.store.scheme()?.criteria ?? [];
      untracked(() => {
        for (const selection of criteria) {
          this.remember(selection.criterion, selection.values);
        }
      });
    });

    // A different scheme starts clean.
    effect(() => {
      this.store.sequenceId();
      untracked(() => {
        this.drafts.set(new Map());
        this.refusal.set(null);
        this.searchControl.setValue('');
        this.distributorControl.setValue('', { emitEvent: false });
        this.distributorControl.updateValueAndValidity();
        this.prevPopControl.setValue('');
        this.prevPop.set('');
      });
    });

    effect(() => {
      const dirty = this.dirtyKeys().length > 0;
      untracked(() => this.store.setDirty('criteria', dirty));
    });

    // The options follow the criterion (and for POP, the distributor). Cached in the service.
    toObservable(computed(() => `${this.optionsKey()}#${this.optionsReload()}`))
      .pipe(
        distinctUntilChanged(),
        switchMap(() => {
          const optionsKey = this.optionsKey();
          this.optionsFailed.set(null);
          if (!optionsKey) {
            this.optionsLoading.set(false);
            return EMPTY;
          }
          const criterion = this.active();
          this.optionsLoading.set(true);
          const call = this.isPop()
            ? this.api.options(criterion, this.distributor(), this.prevPop())
            : this.api.options(criterion);
          return call.pipe(
            tap((list) => {
              this.remember(criterion, list);
              this.options.set({
                key: optionsKey,
                list,
                index: list.map((option) => `${option.name} ${option.code}`.toLowerCase()),
              });
              this.optionsLoading.set(false);
            }),
            catchError((error: unknown) => {
              this.optionsLoading.set(false);
              this.optionsFailed.set(refusalOf(error, 'The options did not load.').message);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe();

    // A new distributor lists its own outlets from scratch.
    this.distributorControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.prevPopControl.setValue('');
      this.prevPop.set('');
      this.searchControl.setValue('');
    });

    this.store.registerSaver('criteria', () => {
      if (this.locked() || !this.editable() || this.saving() || this.dirtyKeys().length === 0) {
        return false;
      }
      this.saveAll();
      return true;
    });
  }

  ngOnDestroy(): void {
    this.store.unregisterSaver('criteria');
    this.store.setDirty('criteria', false);
  }

  // ─── Choosing a criterion ───────────────────────────────────────────────────

  protected choose(item: NavItem): void {
    if (key(this.active()) === item.key) {
      return;
    }
    this.active.set(item.criterion);
    this.searchControl.setValue('');
    this.refusal.set(null);
    if (sameCriterion(item.criterion, CRITERION.pop)) {
      this.preparePop();
    }
  }

  protected prefetch(item: NavItem): void {
    if (!item.readOnly && !sameCriterion(item.criterion, CRITERION.pop)) {
      this.api.prefetchOptions(item.criterion);
    }
  }

  /** POP lists one distributor's outlets; start from the scheme's own first distributor. */
  private preparePop(): void {
    if (this.distributors().length === 0 && !this.distributorsLoading()) {
      this.distributorsLoading.set(true);
      this.api
        .options(CRITERION.distributor)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (list) => {
            this.remember(CRITERION.distributor, list);
            this.distributors.set(this.sortDistributors(list));
            this.distributorsLoading.set(false);
          },
          error: () => this.distributorsLoading.set(false),
        });
    }
    if (!this.distributor()) {
      const own = this.saved().get(key(CRITERION.distributor))?.values[0]?.code;
      if (own) {
        this.distributorControl.setValue(own);
      }
    }
  }

  /** The scheme's own distributors first — they are the ones whose outlets it is about. */
  private sortDistributors(list: TradeOfferOption[]): TradeOfferOption[] {
    const own = new Set(this.saved().get(key(CRITERION.distributor))?.values.map((value) => value.code) ?? []);
    return [...list].sort((a, b) => Number(own.has(b.code)) - Number(own.has(a.code)));
  }

  protected searchPrevPop(): void {
    this.prevPop.set(this.prevPopControl.value.trim());
  }

  protected clearPrevPop(): void {
    this.prevPopControl.setValue('');
    this.prevPop.set('');
  }

  protected retryOptions(): void {
    this.optionsReload.update((value) => value + 1);
  }

  // ─── Editing the selection ──────────────────────────────────────────────────

  protected toggle(code: string): void {
    const draft = this.draft();
    const codes = draft.codes.includes(code) ? draft.codes.filter((candidate) => candidate !== code) : [...draft.codes, code];
    this.setDraft({ ...draft, codes });
  }

  protected remove(code: string): void {
    const draft = this.draft();
    this.setDraft({ ...draft, codes: draft.codes.filter((candidate) => candidate !== code) });
  }

  /** Legacy's `>>`: everything shown. Stops at the length the criterion's column holds. */
  protected addShown(): void {
    const draft = this.draft();
    const codes = [...draft.codes];
    const present = new Set(codes);
    let length = joinedLength(codes);
    let stopped = false;
    for (const option of this.visibleOptions()) {
      if (present.has(option.code)) {
        continue;
      }
      const next = length + option.code.length + (codes.length > 0 ? 2 : 0);
      if (next > CRITERION_VALUE_LENGTH) {
        stopped = true;
        break;
      }
      codes.push(option.code);
      present.add(option.code);
      length = next;
    }
    this.setDraft({ ...draft, codes });
    if (stopped) {
      this.notifications.info(
        `Added as many as fit: a criterion's codes may be at most ${CRITERION_VALUE_LENGTH.toLocaleString('en')} characters. Use Exclude for the few left out.`,
        'Not all added',
      );
    }
  }

  /** Legacy's `<<`. */
  protected removeAll(): void {
    this.setDraft({ ...this.draft(), codes: [] });
  }

  protected setOperator(operator: TradeOfferCriterionOperator): void {
    if (this.draft().operator !== operator) {
      this.setDraft({ ...this.draft(), operator });
    }
  }

  protected discard(): void {
    const active = key(this.active());
    this.drafts.update((drafts) => {
      const next = new Map(drafts);
      next.delete(active);
      return next;
    });
    this.refusal.set(null);
  }

  private setDraft(draft: Draft): void {
    const active = key(this.active());
    this.drafts.update((drafts) => new Map(drafts).set(active, draft));
    if (this.refusal()?.criterion === active) {
      this.refusal.set(null);
    }
  }

  private isDirty(criterionKey: string): boolean {
    const draft = this.drafts().get(criterionKey);
    if (!draft) {
      return false;
    }
    const saved = this.saved().get(criterionKey);
    const savedCodes = saved?.values.map((value) => value.code) ?? [];
    if (draft.codes.length === 0 && savedCodes.length === 0) {
      return false;
    }
    return (
      draft.operator !== (saved?.operator ?? 'Include') ||
      draft.codes.length !== savedCodes.length ||
      draft.codes.some((code, index) => code !== savedCodes[index])
    );
  }

  private remember(criterion: string, values: readonly TradeOfferOption[]): void {
    const criterionKey = key(criterion);
    let names = this.names.get(criterionKey);
    if (!names) {
      names = new Map();
      this.names.set(criterionKey, names);
    }
    for (const value of values) {
      if (value.name) {
        names.set(value.code, value.name);
      }
    }
    this.namesVersion.update((version) => version + 1);
  }

  // ─── Saving ─────────────────────────────────────────────────────────────────

  protected saveActive(): void {
    const active = this.activeMeta();
    if (active) {
      this.saveCriteria([active.criterion]);
    }
  }

  protected saveAll(): void {
    const byKey = new Map(this.catalogueCriteria().map((criterion) => [key(criterion.criterion), criterion.criterion]));
    this.saveCriteria(this.dirtyKeys().map((criterionKey) => byKey.get(criterionKey) ?? criterionKey));
  }

  /** One request per criterion, in order; stops at the first refusal and shows it on that criterion. */
  private saveCriteria(criteria: string[]): void {
    const sequenceId = this.store.sequenceId();
    if (!sequenceId || this.saving() || criteria.length === 0) {
      return;
    }
    this.refusal.set(null);
    let failed = false;
    from(criteria)
      .pipe(
        concatMap((criterion) => {
          if (failed) {
            return EMPTY;
          }
          const draft = this.drafts().get(key(criterion));
          if (!draft) {
            return EMPTY;
          }
          this.saving.set(criterion);
          return this.api.saveCriterion(sequenceId, criterion, { operator: draft.operator, values: draft.codes }).pipe(
            tap((scheme) => {
              this.store.apply(scheme);
              this.drafts.update((drafts) => {
                const next = new Map(drafts);
                next.delete(key(criterion));
                return next;
              });
            }),
            map(() => criterion),
            catchError((error: unknown) => {
              failed = true;
              const refused = refusalOf(error, 'The criterion could not be saved.');
              this.refusal.set({ ...refused, criterion: key(criterion) });
              if (!sameCriterion(this.active(), criterion)) {
                this.active.set(criterion);
              }
              if (isStaleScheme(refused)) {
                this.store.reload();
              }
              return of(null);
            }),
          );
        }),
        toArray(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((results) => {
        this.saving.set(null);
        const saved = results.filter((result): result is string => !!result);
        if (saved.length > 0) {
          const names = saved.map((criterion) => this.dimensionOf(criterion)).join(', ');
          this.notifications.success(`${names} saved.`, 'Criteria saved');
        }
      });
  }

  /** Legacy's Select Criteria: the default Perfect Store criterion. */
  protected seedDefaults(): void {
    const sequenceId = this.store.sequenceId();
    if (!sequenceId || this.seeding()) {
      return;
    }
    this.seeding.set(true);
    this.api
      .seedCriteria(sequenceId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (scheme) => {
          this.seeding.set(false);
          this.store.apply(scheme);
        },
        error: (error: unknown) => {
          this.seeding.set(false);
          this.refusal.set({ ...refusalOf(error), criterion: key(CRITERION.perfectStore) });
        },
      });
  }

  protected dimensionOf(criterion: string): string {
    const criterionKey = key(criterion);
    return (
      this.catalogueCriteria().find((candidate) => key(candidate.criterion) === criterionKey)?.dimension ??
      this.saved().get(criterionKey)?.dimension ??
      criterion
    );
  }

  protected trackOption(_index: number, option: TradeOfferOption): string {
    return option.code;
  }
}
