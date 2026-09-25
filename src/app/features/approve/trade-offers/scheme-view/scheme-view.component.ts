import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { catchError, map, of, startWith, switchMap } from 'rxjs';

import { dec, int } from '../../../../core/api/api.types';
import { ApproveTradeOfferDetailResponse, ApproveUserResponse } from '../../../../core/api/approve.models';
import { messageFor } from '../../../../core/interceptors/error.interceptor';
import { ApprovalChainComponent } from '../../../../shared/components/approval-chain/approval-chain.component';
import { HeadroomBarComponent } from '../../../../shared/components/headroom-bar/headroom-bar.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { ApproveTradeOffersApi } from '../../services/approve-trade-offers.api';
import { formatDate } from '../../shared/approve-common.util';
import {
  CRITERION_PREVIEW,
  approvalChainOf,
  formatMoney,
  formatPlain,
  levelLabel,
  mechanicsFigures,
  periodRange,
  salesfloLine,
  valueLabel,
} from '../approve-trade-offers.util';

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; scheme: ApproveTradeOfferDetailResponse }
  | { kind: 'failed'; message: string; missing: boolean };

/**
 * Legacy's View link, `View_TradePromotions.aspx`, as a drawer over the queue: the setup, the
 * slabs, every criterion by name, the discount mechanics with what is left of the budget, and
 * the approval route. Legacy opened a new window; here the queue and the decision stay where
 * they are, and the scheme can be ticked from the drawer.
 *
 * The view is read on open (or already, from hovering View) and kept for the visit.
 */
@Component({
  selector: 'to-approve-scheme-view',
  standalone: true,
  imports: [TablerIconComponent, ButtonModule, DrawerModule, ApprovalChainComponent, HeadroomBarComponent, SkeletonComponent],
  templateUrl: './scheme-view.component.html',
  styleUrl: './scheme-view.component.scss',
})
export class SchemeViewComponent {
  /** The scheme shown; null closes the drawer. */
  readonly seqId = input<string | null>(null);
  /** Whether it is in the caller's queue — only then can it be ticked from here. */
  readonly inQueue = input(false);
  readonly ticked = input(false);
  /** The budget's owner from the queue row: who level 2 will be, before level 1 signs. */
  readonly budgetOwner = input<ApproveUserResponse | null>(null);

  readonly closed = output<void>();
  readonly toggleTick = output<string>();

  private readonly api = inject(ApproveTradeOffersApi);

  protected readonly icons = ICON_REGISTRY;
  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;
  protected readonly formatPlain = formatPlain;
  protected readonly levelLabel = levelLabel;
  protected readonly valueLabel = valueLabel;
  protected readonly dec = dec;
  protected readonly int = int;
  protected readonly preview = CRITERION_PREVIEW;

  /** Criteria whose full value list is showing. */
  protected readonly expandedCriteria = signal<ReadonlySet<string>>(new Set<string>());
  private readonly retries = signal(0);

  protected readonly state = signal<ViewState>({ kind: 'idle' });

  protected readonly scheme = computed(() => {
    const state = this.state();
    return state.kind === 'ready' ? state.scheme : null;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? state : null;
  });

  protected readonly pendingLevel = computed(() => {
    const scheme = this.scheme();
    return scheme?.pendingLevel === null || scheme?.pendingLevel === undefined ? null : int(scheme.pendingLevel);
  });

  protected readonly chain = computed(() => {
    const scheme = this.scheme();
    return scheme
      ? approvalChainOf({
          initiatedBy: scheme.initiatedBy,
          initiatedOn: scheme.initiatedOn,
          steps: scheme.approvalSteps,
          level: this.pendingLevel(),
          budgetOwner: this.budgetOwner(),
        })
      : [];
  });

  /** The step waiting now: the caller's own level, or past the end when it waits on nobody here. */
  protected readonly chainIndex = computed(() => this.pendingLevel() ?? this.chain().length);

  protected readonly figures = computed(() => {
    const mechanics = this.scheme()?.mechanics;
    return mechanics ? mechanicsFigures(mechanics) : [];
  });

  protected readonly budget = computed(() => {
    const mechanics = this.scheme()?.mechanics;
    if (!mechanics) {
      return null;
    }
    const total = dec(mechanics.totalBudget);
    const elsewhere = dec(mechanics.allocatedElsewhere);
    const discount = dec(mechanics.totalDiscount);
    return { total, elsewhere, discount, left: total - elsewhere - discount };
  });

  protected readonly salesflo = computed(() => {
    const answer = this.scheme()?.mechanics?.salesflo;
    return answer ? salesfloLine(answer) : '';
  });

  protected readonly period = computed(() => {
    const scheme = this.scheme();
    return scheme ? periodRange(scheme.from, scheme.to) : '';
  });

  constructor() {
    toObservable(computed(() => ({ seqId: this.seqId(), retry: this.retries() })))
      .pipe(
        switchMap(({ seqId }) => {
          if (!seqId) {
            return of<ViewState>({ kind: 'idle' });
          }
          return this.api.detail(seqId).pipe(
            map((scheme): ViewState => ({ kind: 'ready', scheme })),
            catchError((error: unknown) =>
              of<ViewState>({
                kind: 'failed',
                missing: error instanceof HttpErrorResponse && error.status === 404,
                message: error instanceof HttpErrorResponse ? messageFor(error) : 'The scheme did not load.',
              }),
            ),
            startWith<ViewState>({ kind: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.state.set(state);
        this.expandedCriteria.set(new Set<string>());
      });
  }

  protected retry(): void {
    this.retries.update((value) => value + 1);
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
    }
  }

  protected isExpanded(criterion: string): boolean {
    return this.expandedCriteria().has(criterion);
  }

  protected expand(criterion: string): void {
    this.expandedCriteria.update((open) => new Set([...open, criterion]));
  }
}
