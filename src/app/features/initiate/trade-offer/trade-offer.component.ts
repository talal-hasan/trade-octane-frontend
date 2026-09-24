import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { distinctUntilChanged, map } from 'rxjs';

import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { ApprovalCardComponent } from './approval-card/approval-card.component';
import { CriteriaCardComponent } from './criteria-card/criteria-card.component';
import { MechanicsCardComponent } from './mechanics-card/mechanics-card.component';
import { SchemeBarComponent } from './scheme-bar/scheme-bar.component';
import { SetupCardComponent } from './setup-card/setup-card.component';
import { SlabCardComponent } from './slab-card/slab-card.component';
import { TradeOfferSummaryComponent } from './summary/trade-offer-summary.component';
import { TradeOfferStore } from './trade-offer.store';
import { TradeOfferStep, formatDateTime } from './trade-offer.util';

const SAVE_ORDER: readonly TradeOfferStep[] = ['setup', 'slab', 'criteria', 'mechanics'];

/**
 * Trade Offer - in Litres — Initiate (MenuID 38), replacing `Based_Weight_Return_In_Value.aspx`.
 *
 * Builder mode (CLAUDE.md §7), in legacy's five parts and order — setup, slab, criteria,
 * discount mechanics, approval route — each saved on its own, because that is how the API
 * (and the scheme tables) take them. What changed from legacy:
 *
 * - **Every part says whether it is saved**, and the summary beside the form lists what still
 *   stops the scheme being sent — the same rules "Check for Approval" applies, read as you go.
 * - **The mechanics compute themselves** as the slab, the master SKUs or the shell change;
 *   legacy's Get Gross Profit Per Litre and Get Total Discount buttons are gone.
 * - **Criteria are ticked, not moved.** One click adds a value; the list of what is selected
 *   stays beside it. POP lists up to 30,000 outlets for a distributor, so the list is virtual.
 * - **Copy into a new scheme.** 84% of schemes since 2025 were saved within ten minutes of
 *   the same user's previous one, 71% with the same dates. A copy starts from the setup, slab
 *   and criteria of the open scheme; only the budget shell is picked again.
 */
@Component({
  selector: 'to-trade-offer',
  standalone: true,
  imports: [
    TablerIconComponent,
    ButtonModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    SchemeBarComponent,
    SetupCardComponent,
    SlabCardComponent,
    CriteriaCardComponent,
    MechanicsCardComponent,
    ApprovalCardComponent,
    TradeOfferSummaryComponent,
  ],
  providers: [TradeOfferStore],
  templateUrl: './trade-offer.component.html',
  styleUrl: './trade-offer.component.scss',
  host: {
    '(document:keydown.control.s)': 'onSaveShortcut($event)',
    '(document:keydown.meta.s)': 'onSaveShortcut($event)',
  },
})
export class TradeOfferComponent implements HasUnsavedChanges {
  protected readonly store = inject(TradeOfferStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly icons = ICON_REGISTRY;
  protected readonly formatDateTime = formatDateTime;

  protected readonly status = computed(() => this.store.scheme()?.status ?? null);

  constructor() {
    // The open scheme is in the URL (`?scheme=183577`), so a scheme can be linked to and the
    // browser's Back returns to the one before. No parameter is a new scheme, as legacy's
    // Scheme Status defaulted to New.
    this.route.queryParamMap
      .pipe(
        map((params) => params.get('scheme')?.trim() ?? ''),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((sequenceId) => {
        if (sequenceId) {
          this.store.open(sequenceId);
        } else if (this.store.sequenceId() || this.store.opening()) {
          this.store.startNew();
        }
      });
  }

  hasUnsavedChanges(): boolean {
    return this.store.hasUnsavedChanges();
  }

  /**
   * Ctrl/⌘+S saves the part the cursor is in; outside every part, the first with unsaved work.
   */
  protected onSaveShortcut(event: Event): void {
    event.preventDefault();
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const step = active?.closest('[data-step]')?.getAttribute('data-step') as TradeOfferStep | null;
    if (step && this.store.save(step)) {
      return;
    }
    for (const candidate of SAVE_ORDER) {
      if (this.store.save(candidate)) {
        return;
      }
    }
  }

  protected startNew(): void {
    this.store.startNew();
    void this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }
}
