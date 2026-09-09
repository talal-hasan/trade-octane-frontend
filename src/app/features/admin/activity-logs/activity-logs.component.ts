import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { int } from '../../../core/api/api.types';
import {
  ActivityLogActorGroup,
  ActivityLogActorResponse,
  ActivityLogResponse,
} from '../../../core/api/operations.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { AdminOperationsApi } from '../services/admin-operations.api';

/**
 * Activity Logs — the audit trail.
 *
 * **This is the one Administration grid that is offset-paged, not keyset.** The response
 * carries `page` / `nextPage` / `pageSize` rather than a cursor, so it can offer real
 * numbered paging and must *not* be wired to `CursorPager`. Read-only throughout: an audit
 * log with an edit control would not be an audit log.
 */
@Component({
  selector: 'to-activity-logs',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './activity-logs.component.html',
  styleUrl: './activity-logs.component.scss',
})
export class ActivityLogsComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly rows = signal<readonly ActivityLogResponse[]>([]);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly fromControl = new FormControl('', { nonNullable: true });
  protected readonly toControl = new FormControl('', { nonNullable: true });
  protected readonly actorGroup = signal<ActivityLogActorGroup | null>(null);
  protected readonly actorId = signal<string | null>(null);

  protected readonly actors = signal<readonly ActivityLogActorResponse[]>([]);

  protected readonly groups: ActivityLogActorGroup[] = [
    'Users',
    'Admins',
    'Systems',
    'Distributors',
  ];

  // Offset paging — see the class comment.
  protected readonly page = signal(1);
  protected readonly pageSize = signal(50);
  protected readonly totalCount = signal(0);
  protected readonly hasNext = signal(false);

  protected readonly rangeLabel = computed(() => {
    const total = this.totalCount();
    if (total === 0) {
      return 'No entries';
    }
    const size = this.pageSize();
    const from = (this.page() - 1) * size + 1;
    const to = Math.min(from + this.rows().length - 1, total);
    return `${from}–${to} of ${total.toLocaleString('en-PK')}`;
  });

  constructor() {
    this.loadActors();
    this.load();
  }

  private loadActors(): void {
    this.api
      .activityLogActors(this.actorGroup() ?? undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actors) => this.actors.set(actors),
        error: () => this.actors.set([]),
      });
  }

  private query(includePaging: boolean) {
    return {
      search: this.searchControl.value.trim() || undefined,
      userId: this.actorId() ?? undefined,
      actorGroup: this.actorGroup() ?? undefined,
      from: this.fromControl.value || undefined,
      to: this.toControl.value || undefined,
      sort: 'CompletedOn' as const,
      desc: true,
      ...(includePaging ? { page: this.page(), pageSize: this.pageSize() } : {}),
    };
  }

  private load(): void {
    this.loading.set(true);
    this.failed.set(false);
    this.api
      .activityLogs(this.query(true))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.rows.set(response.items ?? []);
          this.totalCount.set(int(response.totalCount));
          this.pageSize.set(int(response.pageSize) || this.pageSize());
          this.page.set(int(response.page) || this.page());
          this.hasNext.set(response.nextPage !== null && response.nextPage !== undefined);
          this.loading.set(false);
        },
        error: () => {
          this.rows.set([]);
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  /** Any filter change returns to page 1 — staying on page 7 of a new query is nonsense. */
  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  protected setGroup(group: ActivityLogActorGroup): void {
    this.actorGroup.set(this.actorGroup() === group ? null : group);
    this.actorId.set(null);
    this.loadActors();
    this.applyFilters();
  }

  protected setActor(value: string): void {
    this.actorId.set(value.trim() || null);
    this.applyFilters();
  }

  protected nextPage(): void {
    if (this.hasNext()) {
      this.page.update((p) => p + 1);
      this.load();
    }
  }

  protected previousPage(): void {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }

  protected retry(): void {
    this.load();
  }

  protected exportCsv(): void {
    this.exporting.set(true);
    this.api
      .exportActivityLogs(this.query(false))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(blob, csvFilename('trade-octane-activity-logs'));
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  /** Audit timestamps include the time — a date alone cannot order same-day events. */
  protected formatMoment(value: string | null): string {
    if (!value) {
      return '—';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('en-PK', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
  }
}
