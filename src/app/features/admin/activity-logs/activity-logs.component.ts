import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { Subscription } from 'rxjs';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { AdminApiRoot, adminApiRootOf, int } from '../../../core/api/api.types';
import {
  ACTIVITY_LOG_MAX_RANGE_DAYS,
  ACTIVITY_LOG_MAX_USER_FILTERS,
  ActivityLogActorGroup,
  ActivityLogActorResponse,
  ActivityLogResponse,
} from '../../../core/api/operations.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import {
  MultiSelectPickerComponent,
  PickerOption,
} from '../../../shared/components/multi-select-picker/multi-select-picker.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { ActivityLogQuery, AdminOperationsApi } from '../services/admin-operations.api';

/**
 * Activity Logs — the audit trail.
 *
 * **Two calls, in order.** `/activity-logs/actors` answers who acted in a group and date
 * range; `/activity-logs` is then asked for exactly those people, their ids repeated as
 * `userId`. The people list is also the picker, so narrowing to one person is choosing from
 * names the first call returned rather than guessing a login.
 *
 * **This is the one Administration grid that is offset-paged, not keyset.** The response
 * carries `page` / `nextPage` / `pageSize` rather than a cursor, so it can offer real
 * numbered paging and must *not* be wired to `CursorPager`. Read-only throughout: an audit
 * log with an edit control would not be an audit log.
 *
 * **One screen, two logs.** Administration 2.0's Activity Logs is the same report over
 * Promo_Management_2, served under `/admin2`; its route passes `data: { adminApiRoot:
 * 'admin2' }`. Read from the snapshot rather than an input, because the first load starts in
 * the constructor, before inputs are bound.
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
    MultiSelectPickerComponent,
  ],
  templateUrl: './activity-logs.component.html',
  styleUrl: './activity-logs.component.scss',
})
export class ActivityLogsComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly destroyRef = inject(DestroyRef);

  private readonly source: AdminApiRoot = adminApiRootOf(inject(ActivatedRoute).snapshot.data);
  protected readonly breadcrumbs = [
    { label: this.source === 'admin2' ? 'Administration 2.0' : 'Administration' },
    { label: 'Activity Logs' },
  ];
  protected readonly subtitle =
    this.source === 'admin2' ? 'Who did what in Administration 2.0, and when.' : 'Who did what, and when.';

  protected readonly icons = ICON_REGISTRY;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];

  protected readonly groups: ActivityLogActorGroup[] = [
    'Users',
    'Admins',
    'Systems',
    'Distributors',
  ];

  // ─── Filters ────────────────────────────────────────────────────────────────

  // Required by both endpoints, so the screen always has one. It opens on the month so far.
  protected readonly group = signal<ActivityLogActorGroup>('Users');
  protected readonly from = signal(isoDate(firstOfMonth(new Date())));
  protected readonly to = signal(isoDate(new Date()));
  protected readonly searchControl = new FormControl('', { nonNullable: true });

  /** Why the range can't be asked for, or null when it can — the server's checks, said first. */
  protected readonly rangeError = computed<string | null>(() => {
    const from = this.from();
    const to = this.to();
    if (!from || !to) {
      return 'Pick both a start and an end date.';
    }
    // yyyy-MM-dd strings order the same way as the dates they spell.
    if (from > to) {
      return 'The start date must be on or before the end date.';
    }
    if (daysInclusive(from, to) > ACTIVITY_LOG_MAX_RANGE_DAYS) {
      return `The log covers at most ${ACTIVITY_LOG_MAX_RANGE_DAYS} days at a time. Shorten the range.`;
    }
    return null;
  });

  // ─── Step 1 — who acted ─────────────────────────────────────────────────────

  protected readonly actors = signal<readonly ActivityLogActorResponse[]>([]);
  protected readonly actorsLoading = signal(true);
  protected readonly actorsFailed = signal(false);
  /** The people narrowed to. Empty means everyone step 1 returned. */
  protected readonly selectedActorIds = signal<ReadonlySet<string>>(new Set<string>());
  private actorsRequest: Subscription | null = null;

  /** Display name to recognise, login name to tell two of the same name apart. */
  protected readonly actorOptions = computed<PickerOption[]>(() =>
    this.actors().map((actor) => ({
      value: actor.userId,
      label: actor.displayName || actor.userId,
      // System actors have no account, so their display name is the id itself.
      hint: actor.displayName && actor.displayName !== actor.userId ? actor.userId : undefined,
    })),
  );

  protected readonly everyoneLabel = computed(() => {
    const count = this.actors().length;
    return count === 1 ? '1 person' : `All ${count.toLocaleString('en-PK')} people`;
  });

  /** The ids step 2 is asked for: the people picked, or everyone step 1 returned. */
  protected readonly userIds = computed<readonly string[]>(() => {
    const picked = this.selectedActorIds();
    return picked.size > 0 ? [...picked] : this.actors().map((actor) => actor.userId);
  });

  /** Past the per-request cap. Never seen in the data so far, but `/actors` allows 5,000. */
  protected readonly tooManyPeople = computed(
    () => this.userIds().length > ACTIVITY_LOG_MAX_USER_FILTERS,
  );

  protected readonly noActivityMessage = computed(
    () =>
      `No one in ${this.group()} did anything between ${this.formatDay(this.from())} and ${this.formatDay(this.to())}.`,
  );

  protected readonly tooManyMessage = computed(
    () =>
      `${this.userIds().length.toLocaleString('en-PK')} people in ${this.group()} were active in this range, ` +
      `and the log can show up to ${ACTIVITY_LOG_MAX_USER_FILTERS} at a time. Pick people from the list, or shorten the range.`,
  );

  /** Whether step 2 can be asked at all: a valid range and 1–100 people to name. */
  protected readonly canQuery = computed(
    () => this.rangeError() === null && this.userIds().length > 0 && !this.tooManyPeople(),
  );

  // ─── Step 2 — the entries ───────────────────────────────────────────────────

  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  protected readonly exporting = signal(false);
  protected readonly rows = signal<readonly ActivityLogResponse[]>([]);
  private logsRequest: Subscription | null = null;

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
  }

  /**
   * Step 1. Everything below depends on its answer, so a new call cancels the previous one
   * *and* any logs call made from it — a slow reply for the group or range chosen before
   * must not land last and repopulate the people or the grid.
   */
  private loadActors(): void {
    this.actorsRequest?.unsubscribe();
    this.logsRequest?.unsubscribe();
    this.page.set(1);
    this.actorsFailed.set(false);
    this.failed.set(false);
    this.loading.set(false);

    if (this.rangeError() !== null) {
      this.actors.set([]);
      this.clearRows();
      this.actorsLoading.set(false);
      return;
    }

    this.actorsLoading.set(true);
    this.actorsRequest = this.api
      .activityLogActors({ from: this.from(), to: this.to(), group: this.group() }, this.source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actors) => {
          const list = actors ?? [];
          this.actors.set(list);
          // Keep only picks who still acted in this range. Naming someone with no entries
          // here would narrow the grid to nothing without saying why.
          const present = new Set(list.map((actor) => actor.userId));
          this.selectedActorIds.update(
            (picked) => new Set([...picked].filter((userId) => present.has(userId))),
          );
          this.actorsLoading.set(false);
          this.load();
        },
        error: () => {
          this.actors.set([]);
          this.clearRows();
          this.actorsLoading.set(false);
          this.actorsFailed.set(true);
        },
      });
  }

  /**
   * The step 2 query, or null when there is nothing valid to ask. `group` goes with the ids,
   * as in the endpoint's own example, so the server applies the same rule step 1 did.
   */
  private query(): Omit<ActivityLogQuery, 'page' | 'pageSize'> | null {
    if (!this.canQuery()) {
      return null;
    }
    return {
      from: this.from(),
      to: this.to(),
      group: this.group(),
      userId: this.userIds(),
      search: this.searchControl.value.trim() || undefined,
      sort: 'CompletedOn',
      desc: true,
    };
  }

  /** Step 2. */
  private load(): void {
    // Never ahead of step 1: until it answers, the ids on hand belong to the previous group or
    // range. `loadActors` calls back here once they are current.
    if (this.actorsLoading()) {
      return;
    }
    this.logsRequest?.unsubscribe();
    const query = this.query();
    if (!query) {
      // Nothing to ask — no one acted in range, or more people than one call may name. The
      // template says which; a request here could only come back a 400.
      this.clearRows();
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.failed.set(false);
    this.logsRequest = this.api
      .activityLogs({ ...query, page: this.page(), pageSize: this.pageSize() }, this.source)
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
          this.clearRows();
          this.loading.set(false);
          this.failed.set(true);
        },
      });
  }

  private clearRows(): void {
    this.rows.set([]);
    this.totalCount.set(0);
    this.hasNext.set(false);
  }

  // ─── Filter changes ─────────────────────────────────────────────────────────

  protected setGroup(group: ActivityLogActorGroup): void {
    // Picks one rather than toggling off: both endpoints need a group.
    if (this.group() === group) {
      return;
    }
    this.group.set(group);
    // Nobody picked from one group can be in another.
    this.selectedActorIds.set(new Set<string>());
    this.loadActors();
  }

  protected setFrom(value: string): void {
    this.from.set(value);
    this.loadActors();
  }

  protected setTo(value: string): void {
    this.to.set(value);
    this.loadActors();
  }

  protected setActors(next: ReadonlySet<string>): void {
    this.selectedActorIds.set(next);
    this.applyFilters();
  }

  /** Any filter change returns to page 1 — staying on page 7 of a new query is nonsense. */
  protected applyFilters(): void {
    this.page.set(1);
    this.load();
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

  /** Retries whichever step failed — the entries can't be retried without the people. */
  protected retry(): void {
    if (this.actorsFailed()) {
      this.loadActors();
    } else {
      this.load();
    }
  }

  protected exportCsv(): void {
    // The same query the grid is showing, never a bare one that would export something else.
    const query = this.query();
    if (!query) {
      return;
    }
    this.exporting.set(true);
    this.api
      .exportActivityLogs(query, this.source)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          saveBlob(
            blob,
            csvFilename(this.source === 'admin2' ? 'trade-octane-admin2-activity-logs' : 'trade-octane-activity-logs'),
          );
          this.exporting.set(false);
        },
        error: () => this.exporting.set(false),
      });
  }

  /** "01 Sep 2026" — for the empty state, which names the range it searched. */
  protected formatDay(value: string): string {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    // Intl throws on an invalid date; show what was typed instead.
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
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

/** yyyy-MM-dd in local time. `toISOString` is UTC, which is yesterday before 05:00 in Pakistan. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function firstOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/** Days from `from` to `to`, counting both — how the server measures the 31-day limit. */
function daysInclusive(from: string, to: string): number {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000) + 1;
}
