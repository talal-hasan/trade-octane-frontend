import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { debounceTime, distinctUntilChanged, startWith } from 'rxjs';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { int } from '../../../core/api/api.types';
import {
  APPROVAL_STAGE_LABELS,
  APPROVAL_TABLE_LABELS,
  ApprovalQueueResponse,
  ApprovalStage,
  ApprovalTable,
  PendingApprovalResponse,
} from '../../../core/api/operations.models';
import { CursorPager } from '../../../core/api/cursor-pager';
import { NotificationService } from '../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { AdminOperationsApi } from '../services/admin-operations.api';
import { AdminUsersApi } from '../services/admin-users.api';

/**
 * Re-Route Scheme — moving a stuck approval queue to someone who can act on it.
 *
 * The problem this solves is specific: legacy stored the approver as a free-text string,
 * and thousands of pending rows hold a dropdown placeholder rather than a person. Those
 * queues can never drain, because nobody can sign in as "--Select--". `holderStatus` and
 * `isActionable` make them visible; `stuckOnly` filters to exactly them.
 *
 * The flow is deliberately three steps rather than one, because this writes to live
 * approval chains:
 *
 *   1. **Find the queue** — table + stage + holder, with the stuck ones one click away.
 *   2. **Preview** the rows that would move. This is not decoration: `expectedCount` for
 *      the transfer is taken from this preview.
 *   3. **Transfer**, naming the count. The server re-counts its own UPDATE and rolls the
 *      whole thing back with a 409 if the queue moved in between, so a re-route is never
 *      half-applied.
 */
@Component({
  selector: 'to-approval-routing',
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
  templateUrl: './approval-routing.component.html',
  styleUrl: './approval-routing.component.scss',
})
export class ApprovalRoutingComponent {
  private readonly operationsApi = inject(AdminOperationsApi);
  private readonly usersApi = inject(AdminUsersApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly tableLabels = APPROVAL_TABLE_LABELS;
  protected readonly stageLabels = APPROVAL_STAGE_LABELS;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5];

  protected readonly tables: ApprovalTable[] = [
    'SchemeApprovals',
    'BudgetApprovals',
    'JbpExceptionApprovals',
  ];
  protected readonly stages: ApprovalStage[] = ['Role1', 'Role2', 'Role3', 'Rmc'];

  // ─── Queue census ───────────────────────────────────────────────────────────

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly queues = signal<readonly ApprovalQueueResponse[]>([]);
  protected readonly totalPending = signal(0);
  protected readonly stuckPending = signal(0);

  protected readonly table = signal<ApprovalTable | null>(null);
  protected readonly stage = signal<ApprovalStage | null>(null);
  protected readonly stuckOnly = signal(false);
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  private readonly pager = new CursorPager(25);
  protected readonly pagerState = this.pager.state;

  private readonly search = toSignalSearch(this.searchControl, this.destroyRef);

  constructor() {
    this.loadQueues();
  }

  private query(includeCursor: boolean) {
    return {
      table: this.table() ?? undefined,
      stage: this.stage() ?? undefined,
      search: this.search().trim() || undefined,
      stuckOnly: this.stuckOnly() || undefined,
      sort: 'PendingCount' as const,
      desc: true,
      ...(includeCursor ? { pageSize: this.pager.pageSize(), cursor: this.pager.cursor() } : {}),
    };
  }

  private loadQueues(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.operationsApi
      .approvalQueues(this.query(true))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const items = page.items ?? [];
          this.queues.set(items);
          this.totalPending.set(int(page.totalPendingRows));
          this.stuckPending.set(int(page.stuckPendingRows));
          this.pager.absorb({
            nextCursor: page.nextCursor ?? null,
            totalCount: page.totalCount,
            pageSize: this.pager.pageSize(),
            rowCount: items.length,
          });
          this.loading.set(false);
        },
        error: () => {
          this.queues.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  private reload(): void {
    this.pager.reset();
    this.loadQueues();
  }

  protected setTable(value: ApprovalTable | null): void {
    this.table.set(this.table() === value ? null : value);
    this.reload();
  }

  protected setStage(value: ApprovalStage | null): void {
    this.stage.set(this.stage() === value ? null : value);
    this.reload();
  }

  protected toggleStuckOnly(): void {
    this.stuckOnly.update((value) => !value);
    this.reload();
  }

  protected onSearch(): void {
    this.reload();
  }

  protected nextPage(): void {
    if (this.pager.next()) {
      this.loadQueues();
    }
  }

  protected previousPage(): void {
    if (this.pager.previous()) {
      this.loadQueues();
    }
  }

  protected retry(): void {
    this.reload();
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.operationsApi
      .exportApprovalQueues(this.query(false))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('trade-octane-approval-queues'));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  // ─── Preview + transfer ─────────────────────────────────────────────────────

  protected readonly selected = signal<ApprovalQueueResponse | null>(null);
  protected readonly previewLoading = signal(false);
  protected readonly preview = signal<readonly PendingApprovalResponse[]>([]);
  /** The count the transfer is guarded on. Comes from the preview, never recomputed. */
  protected readonly previewCount = signal(0);
  protected readonly previewTruncated = signal(false);

  protected readonly newHolderControl = new FormControl('', { nonNullable: true });
  protected readonly holderOptions = signal<readonly { userId: string; fullName: string }[]>([]);
  protected readonly transferring = signal(false);
  protected readonly confirming = signal(false);

  protected select(queue: ApprovalQueueResponse): void {
    this.selected.set(queue);
    this.preview.set([]);
    this.previewCount.set(0);
    this.newHolderControl.setValue('');
    this.loadPreview(queue);
    this.loadHolderOptions();
  }

  protected clearSelection(): void {
    this.selected.set(null);
    this.preview.set([]);
  }

  private loadPreview(queue: ApprovalQueueResponse): void {
    this.previewLoading.set(true);
    this.operationsApi
      .pendingApprovals({
        table: queue.table,
        stage: queue.stage,
        holder: queue.holder,
        pageSize: 50,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const items = page.items ?? [];
          this.preview.set(items);
          // The guard count is the queue's *total*, not the page we happened to render.
          this.previewCount.set(int(page.totalCount));
          this.previewTruncated.set(items.length < int(page.totalCount));
          this.previewLoading.set(false);
        },
        error: () => this.previewLoading.set(false),
      });
  }

  /** Active users, as the destinations a queue can be handed to. */
  private loadHolderOptions(): void {
    if (this.holderOptions().length > 0) {
      return;
    }
    this.usersApi
      .list({ status: 'Active', sort: 'FullName', pageSize: 200 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) =>
          this.holderOptions.set(
            (page.data ?? []).map((user) => ({
              userId: user.userId,
              fullName: user.fullName || user.userId,
            })),
          ),
        error: () => this.holderOptions.set([]),
      });
  }

  protected readonly canTransfer = computed(
    () =>
      this.selected() !== null &&
      this.newHolderControl.value.trim().length > 0 &&
      this.previewCount() > 0 &&
      !this.transferring(),
  );

  protected readonly confirmMessage = computed(() => {
    const queue = this.selected();
    const count = this.previewCount();
    const holder = this.newHolderControl.value;
    if (!queue) {
      return '';
    }
    return `${count} pending ${count === 1 ? 'approval' : 'approvals'} at ${this.stageLabels[queue.stage]} will move from "${queue.holder}" to ${holder}. If the queue changes before this runs, the whole transfer is rolled back rather than half-applied.`;
  });

  protected confirmTransfer(): void {
    this.confirming.set(false);
    const queue = this.selected();
    const newHolder = this.newHolderControl.value.trim();
    if (!queue || !newHolder) {
      return;
    }

    this.transferring.set(true);
    this.operationsApi
      .reRoute({
        table: queue.table,
        stage: queue.stage,
        currentHolder: queue.holder,
        newHolder,
        expectedCount: this.previewCount(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.transferring.set(false);
          this.notifications.success(
            `${int(response.movedCount)} approval(s) moved to ${response.newHolderFullName ?? response.newHolder}.`,
          );
          this.clearSelection();
          this.reload();
        },
        error: () => this.transferring.set(false),
      });
  }

  protected holderLabel(queue: ApprovalQueueResponse): string {
    if (queue.holderStatus === 'NotAUser') {
      // Legacy stored the approver as free text; these rows hold a placeholder, not a name.
      return queue.holder || '(no approver set)';
    }
    return queue.holderFullName || queue.holder;
  }

  protected formatDate(value: string | null): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(date);
  }
}

/** Debounced search signal. Shared shape across the Administration grids. */
function toSignalSearch(control: FormControl<string>, destroyRef: DestroyRef) {
  const value = signal('');
  control.valueChanges
    .pipe(debounceTime(300), distinctUntilChanged(), startWith(''), takeUntilDestroyed(destroyRef))
    .subscribe((next) => value.set(next ?? ''));
  return value.asReadonly();
}
