import { Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { AutoComplete, AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { Subscription } from 'rxjs';

import { int } from '../../../../core/api/api.types';
import { TradeOfferSchemeSummary } from '../../../../core/api/initiate.models';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { TradeOffersApi } from '../../services/trade-offers.api';
import { TradeOfferStore } from '../trade-offer.store';
import { formatPeriod, statusLabel, statusPill } from '../trade-offer.util';

/** A scheme in the picker: the summary, with the label the input shows once it is picked. */
interface SchemeOption extends TradeOfferSchemeSummary {
  label: string;
}

function toOption(summary: TradeOfferSchemeSummary): SchemeOption {
  return { ...summary, label: `${summary.sequenceId} · ${summary.schemeId || summary.description}` };
}

const PAGE_SIZE = 50;

/**
 * Legacy's Scheme Status (New | Existing) and Sequence ID dropdown.
 *
 * The dropdown listed every one of the caller's editable schemes — one initiator has 706 —
 * sorted as text, so "99999" came after "183577". Here it is searched on the server by
 * sequence id, scheme id or description, newest first, fifty at a time.
 */
@Component({
  selector: 'to-trade-offer-scheme-bar',
  standalone: true,
  imports: [ReactiveFormsModule, TablerIconComponent, AutoCompleteModule, ButtonModule, StatusPillComponent],
  templateUrl: './scheme-bar.component.html',
  styleUrl: './scheme-bar.component.scss',
})
export class SchemeBarComponent {
  protected readonly store = inject(TradeOfferStore);
  private readonly api = inject(TradeOffersApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly statusLabel = statusLabel;
  protected readonly statusPill = statusPill;
  protected readonly formatPeriod = formatPeriod;

  private readonly autoComplete = viewChild<AutoComplete>('picker');

  /** "Existing" was chosen with no scheme open yet: the picker shows, waiting for a pick. */
  private readonly wantsExisting = signal(false);
  protected readonly mode = computed<'new' | 'existing'>(() =>
    this.store.scheme() || this.store.opening() || this.wantsExisting() ? 'existing' : 'new',
  );

  protected readonly pick = new FormControl<SchemeOption | string | null>(null);
  protected readonly suggestions = signal<SchemeOption[]>([]);
  protected readonly total = signal(0);
  protected readonly nextPage = signal<number | null>(null);
  protected readonly searching = signal(false);
  protected readonly searchFailed = signal(false);
  private lastQuery = '';
  private search$: Subscription | null = null;

  constructor() {
    // The input shows the open scheme, whichever way it was opened.
    effect(() => {
      const scheme = this.store.scheme();
      const shown = this.pick.value;
      if (!scheme) {
        if (shown && typeof shown !== 'string') {
          this.pick.setValue(null, { emitEvent: false });
        }
        return;
      }
      if (!shown || typeof shown === 'string' || shown.sequenceId !== scheme.sequenceId) {
        this.pick.setValue(
          toOption({
            sequenceId: scheme.sequenceId,
            schemeId: scheme.schemeId,
            description: scheme.description,
            fromDate: scheme.fromDate,
            toDate: scheme.toDate,
            claimType: scheme.claimType.code,
            status: scheme.status,
            createdOn: scheme.createdOn,
          }),
          { emitEvent: false },
        );
      }
    });
  }

  // ─── Searching ──────────────────────────────────────────────────────────────

  protected search(query: string): void {
    this.lastQuery = query ?? '';
    this.load(1, false);
  }

  protected more(): void {
    const page = this.nextPage();
    if (page) {
      this.load(page, true);
    }
  }

  private load(page: number, append: boolean): void {
    this.search$?.unsubscribe();
    this.searching.set(true);
    this.searchFailed.set(false);
    this.search$ = this.api
      .schemes(this.lastQuery, page, PAGE_SIZE)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const options = result.items.map(toOption);
          this.suggestions.set(append ? [...this.suggestions(), ...options] : options);
          this.total.set(int(result.totalCount));
          this.nextPage.set(result.nextPage == null ? null : int(result.nextPage));
          this.searching.set(false);
        },
        error: () => {
          this.searching.set(false);
          this.searchFailed.set(true);
          if (!append) {
            this.suggestions.set([]);
          }
        },
      });
  }

  // ─── Choosing ───────────────────────────────────────────────────────────────

  protected picked(option: SchemeOption): void {
    if (option.sequenceId === this.store.sequenceId()) {
      return;
    }
    if (!this.confirmLeave()) {
      this.restorePick();
      return;
    }
    void this.router.navigate([], { relativeTo: this.route, queryParams: { scheme: option.sequenceId } });
  }

  protected chooseNew(): void {
    if (this.mode() === 'new' && !this.store.copySource()) {
      return;
    }
    if (!this.confirmLeave()) {
      return;
    }
    this.wantsExisting.set(false);
    this.store.startNew();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected chooseExisting(): void {
    if (this.mode() === 'existing') {
      return;
    }
    this.wantsExisting.set(true);
    // Open the list at once: the newest schemes are usually the one wanted.
    queueMicrotask(() => {
      const picker = this.autoComplete();
      picker?.inputEL?.nativeElement.focus();
    });
  }

  /** A new scheme starting from the open one's setup, slab and criteria. */
  protected copy(): void {
    const source = this.store.scheme();
    if (!source) {
      return;
    }
    if (!this.confirmLeave()) {
      return;
    }
    this.wantsExisting.set(false);
    this.store.startNew(source);
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  protected cancelCopy(): void {
    this.store.copySource.set(null);
  }

  /** Typing without picking leaves the input empty (forceSelection); show the open scheme again. */
  protected onBlur(): void {
    queueMicrotask(() => {
      const shown = this.pick.value;
      if (this.store.scheme() && (!shown || typeof shown === 'string')) {
        this.restorePick();
      }
    });
  }

  /** Changing scheme drops unsaved edits; the route guard never sees a query-string change. */
  private confirmLeave(): boolean {
    return !this.store.hasUnsavedChanges() || confirm('You have unsaved changes. Leave without saving?');
  }

  /** Puts the open scheme back in the input — after a refused switch, or a search abandoned. */
  private restorePick(): void {
    const scheme = this.store.scheme();
    this.pick.setValue(
      scheme
        ? toOption({
            sequenceId: scheme.sequenceId,
            schemeId: scheme.schemeId,
            description: scheme.description,
            claimType: scheme.claimType.code,
            status: scheme.status,
          })
        : null,
      { emitEvent: false },
    );
  }
}
