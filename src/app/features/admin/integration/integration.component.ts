import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription, interval } from 'rxjs';

import { int } from '../../../core/api/api.types';
import {
  BatchSummaryResponse,
  IntegrationRunResponse,
  IntegrationRunState,
} from '../../../core/api/operations.models';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { IntegrationApi } from '../services/integration.api';

/** States in which a run is still moving and therefore worth polling. */
const LIVE_STATES: ReadonlySet<IntegrationRunState> = new Set(['Queued', 'Running']);

/**
 * Integration — Auto-DA releases and batch-status pushes.
 *
 * Two things make this screen different from the rest of Administration:
 *
 * 1. **Runs are asynchronous.** Starting one returns 202 and a `runId`; progress arrives
 *    from `/integration/runs`. The list therefore polls, but only while something is
 *    actually `Queued` or `Running` — polling a settled list forever is just load.
 * 2. **It posts to SAP.** Every start offers a **dry run**, and dry run is the default.
 *    For an action with external side effects, the safe option should be the one you get
 *    by not thinking about it.
 */
@Component({
  selector: 'to-integration',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './integration.component.html',
  styleUrl: './integration.component.scss',
})
export class IntegrationComponent {
  private readonly api = inject(IntegrationApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = [0, 1, 2, 3];

  protected readonly runsLoading = signal(true);
  protected readonly runsFailed = signal(false);
  protected readonly runs = signal<readonly IntegrationRunResponse[]>([]);
  protected readonly expandedRunId = signal<string | null>(null);

  private pollSubscription: Subscription | null = null;

  constructor() {
    this.loadRuns();
    this.loadBatches();

    // Poll only while something is live. `destroyRef` tears this down with the component.
    this.pollSubscription = interval(5000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.hasLiveRun()) {
          this.loadRuns(true);
        }
      });
  }

  protected readonly hasLiveRun = computed(() =>
    this.runs().some((run) => LIVE_STATES.has(run.state)),
  );

  private loadRuns(quiet = false): void {
    if (!quiet) {
      this.runsLoading.set(true);
      this.runsFailed.set(false);
    }
    this.api
      .runs({ take: 25 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.runs.set(page.runs ?? []);
          this.runsLoading.set(false);
        },
        error: () => {
          this.runsLoading.set(false);
          if (!quiet) {
            this.runsFailed.set(true);
          }
        },
      });
  }

  protected retryRuns(): void {
    this.loadRuns();
  }

  protected toggleRun(runId: string): void {
    this.expandedRunId.update((current) => (current === runId ? null : runId));
  }

  // ─── Batch status ───────────────────────────────────────────────────────────

  protected readonly batchesLoading = signal(true);
  protected readonly batches = signal<BatchSummaryResponse | null>(null);
  protected readonly batchSelection = signal<ReadonlySet<string>>(new Set<string>());
  protected readonly batchSearchControl = new FormControl('', { nonNullable: true });

  private loadBatches(): void {
    this.batchesLoading.set(true);
    this.api
      .batches({ search: this.batchSearchControl.value.trim() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (summary) => {
          this.batches.set(summary);
          this.batchSelection.set(new Set<string>());
          this.batchesLoading.set(false);
        },
        error: () => {
          this.batches.set(null);
          this.batchesLoading.set(false);
        },
      });
  }

  protected searchBatches(): void {
    this.loadBatches();
  }

  protected toggleBatch(batch: string): void {
    this.batchSelection.update((current) => {
      const next = new Set(current);
      if (!next.delete(batch)) {
        next.add(batch);
      }
      return next;
    });
  }

  protected readonly allBatchesSelected = computed(() => {
    const rows = this.batches()?.rows ?? [];
    const selected = this.batchSelection();
    return rows.length > 0 && rows.every((row) => selected.has(row.batch));
  });

  protected toggleAllBatches(): void {
    const rows = this.batches()?.rows ?? [];
    this.batchSelection.set(
      this.allBatchesSelected() ? new Set() : new Set(rows.map((row) => row.batch)),
    );
  }

  // ─── Starting runs ──────────────────────────────────────────────────────────

  /** Dry run defaults to on: the safe option should be the one you get by default. */
  protected readonly batchDryRun = signal(true);
  protected readonly autoDaDryRun = signal(true);
  protected readonly autoDaPeriodControl = new FormControl('', { nonNullable: true });
  protected readonly autoDaDeliveryControl = new FormControl('', { nonNullable: true });
  protected readonly starting = signal(false);
  protected readonly confirming = signal<'batch' | 'autoda' | null>(null);

  protected readonly confirmMessage = computed(() => {
    const kind = this.confirming();
    if (kind === 'batch') {
      const count = this.batchSelection().size;
      return this.batchDryRun()
        ? `Dry run: ${count} batch(es) will be evaluated and reported, with nothing sent to SAP.`
        : `${count} batch(es) will be pushed to SAP. This has external side effects and cannot be undone from here.`;
    }
    if (kind === 'autoda') {
      return this.autoDaDryRun()
        ? 'Dry run: the release will be evaluated and reported, with nothing posted.'
        : 'Deliveries will be released against SAP. This has external side effects and cannot be undone from here.';
    }
    return '';
  });

  protected start(): void {
    const kind = this.confirming();
    this.confirming.set(null);
    if (!kind) {
      return;
    }

    this.starting.set(true);
    const request$ =
      kind === 'batch'
        ? this.api.startBatchPush({
            batchNumbers: [...this.batchSelection()],
            dryRun: this.batchDryRun(),
          })
        : this.api.startAutoDaRelease({
            period: this.autoDaPeriodControl.value.trim() || null,
            deliveryNumber: this.autoDaDeliveryControl.value.trim() || null,
            dryRun: this.autoDaDryRun(),
          });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (accepted) => {
        this.starting.set(false);
        this.notifications.success(
          `${accepted.dryRun ? 'Dry run' : 'Run'} queued (${accepted.runId}). Progress appears below.`,
        );
        this.loadRuns(true);
      },
      error: () => this.starting.set(false),
    });
  }

  protected readonly canStartBatch = computed(
    () => this.batchSelection().size > 0 && !this.starting(),
  );

  // ─── Presentation ───────────────────────────────────────────────────────────

  protected stateLabel(state: IntegrationRunState): string {
    switch (state) {
      case 'CompletedWithFailures':
        return 'Completed with failures';
      default:
        return state;
    }
  }

  /** Maps a run state to the flag styling. Partial success is a warning, not a success. */
  protected stateTone(state: IntegrationRunState): 'ok' | 'warn' | 'bad' | 'live' {
    switch (state) {
      case 'Succeeded':
        return 'ok';
      case 'CompletedWithFailures':
        return 'warn';
      case 'Failed':
      case 'Cancelled':
        return 'bad';
      default:
        return 'live';
    }
  }

  protected progressPercent(run: IntegrationRunResponse): number {
    const total = int(run.total);
    if (total <= 0) {
      return 0;
    }
    return Math.min(100, Math.round((int(run.processed) / total) * 100));
  }

  protected formatMoment(value: string | null): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en-PK', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
  }
}
