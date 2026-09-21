import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import {
  EMPTY,
  Observable,
  Subject,
  Subscription,
  catchError,
  concatMap,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  tap,
} from 'rxjs';

import { csvFilename, saveBlob } from '../../../core/api/api-client.service';
import { int } from '../../../core/api/api.types';
import { RoleResponse } from '../../../core/api/admin.models';
import {
  APPROVAL_STAGE_LABELS,
  APPROVAL_TABLE_LABELS,
  ApprovalQueueResponse,
  ApprovalStage,
  ApprovalTable,
  EligibleHoldersResponse,
  PendingApprovalResponse,
} from '../../../core/api/operations.models';
import { messageFor } from '../../../core/interceptors/error.interceptor';
import { NotificationService } from '../../../core/services/notification.service';
import {
  ConfirmDetail,
  ConfirmDialogComponent,
} from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { AdminOperationsApi } from '../services/admin-operations.api';
import { AdminRolesApi } from '../services/admin-roles.api';
import { ReRouteOverviewComponent } from './re-route-overview.component';
import { ReRouteReceiptComponent } from './re-route-receipt.component';
import {
  APPROVAL_STAGES,
  APPROVAL_TABLES,
  APPROVAL_TABLE_SHORT,
  HolderGroup,
  HolderQueue,
  HolderSort,
  HolderView,
  MatrixCell,
  RunLine,
  RunState,
  candidateLabel,
  censusCsv,
  countChange,
  displayName,
  formatDate,
  formatCount,
  formatDateTime,
  groupByHolder,
  holderKey,
  inScope,
  inView,
  initials,
  mergeNotes,
  parseRoleId,
  parseStage,
  parseTable,
  parseView,
  queueKey,
  queueLabel,
  runMoved,
  searchHolders,
  sortHolders,
  stageExists,
  stageMatrix,
  stageToken,
  tableToken,
  viewFacets,
  waited,
} from './re-route.util';

type LoadState = 'loading' | 'ready' | 'failed';

/** One queue's preview: the rows shown, and the total the write is guarded on. */
interface PreviewState {
  status: LoadState;
  rows: readonly PendingApprovalResponse[];
  /** The binding count. Sent back as `expectedCount`; never the census figure. */
  total: number;
  nextCursor: string | null;
  loadingMore: boolean;
}

interface EligibilityState {
  status: LoadState;
  data: EligibleHoldersResponse | null;
}

interface CandidateOption {
  value: string;
  label: string;
  login: string;
  /** What this person already holds, across every table and level. */
  holding: number;
}

interface ViewOption {
  view: HolderView;
  label: string;
  tone: 'default' | 'warn' | 'ok';
  hint: string;
}

/** Rows per preview page. Kept constant: the server's cursor is only valid for its page size. */
const PREVIEW_PAGE = 50;

/**
 * Re-Route Scheme — `Re_Route_Role_Based.aspx`, rebuilt around the question it was for.
 *
 * **What the old page was.** Request type, user role, current user, new user, table, level:
 * six dependent dropdowns, a Search that filled a grid, and a Re-Route button that moved one
 * table-and-level at a time. It answered "what is this one person holding" only after four
 * postbacks, its Current User list held active accounts only, and its Level list never
 * offered RMC — so of 19,644 pending approvals it could reach at most 4,225, the ones least
 * in need of moving. It never said whether the move worked.
 *
 * **What this is.** The old dropdowns become filters over a list that is already there:
 *
 *   1. **Every approver holding work**, one row each, with the stuck ones (deactivated, or a
 *      string that was never an account — "Please Select", "<-- FORWARD TO -->") flagged and
 *      one click away. Table, Level and Role narrow the list rather than gate it.
 *   2. **Pick one**, and everything they hold across every table and level is on one panel,
 *      each queue previewed with the count the write will be held to.
 *   3. **Pick who takes it** — only people who share a role with them, the old screen's rule —
 *      and re-route the ticked queues in one go. Each queue is its own guarded transaction and
 *      reports its own outcome.
 *
 * **Why it is fast.** The census is 100 queues across 87 approvers. It is read once (one
 * request of eleven heap scans) and every filter, facet and sort runs in memory. Previews are
 * fetched per queue, one at a time — each is a scan of a 200,000-row heap — cached for the
 * visit, and skipped if the admin has already moved on to another approver.
 *
 * Filters and the selected approver live in the query string, so a view can be linked to:
 * `/admin/re-route?holder=burhan.abid`.
 */
@Component({
  selector: 'to-re-route',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
    ReRouteOverviewComponent,
    ReRouteReceiptComponent,
  ],
  templateUrl: './re-route.component.html',
  styleUrl: './re-route.component.scss',
})
export class ReRouteComponent {
  private readonly api = inject(AdminOperationsApi);
  private readonly rolesApi = inject(AdminRolesApi);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly tables = APPROVAL_TABLES;
  protected readonly stages = APPROVAL_STAGES;
  protected readonly tableLabels = APPROVAL_TABLE_LABELS;
  protected readonly tableShort = APPROVAL_TABLE_SHORT;
  protected readonly stageLabels = APPROVAL_STAGE_LABELS;
  protected readonly skeletonRows = [0, 1, 2, 3, 4, 5, 6, 7];

  protected readonly displayName = displayName;
  protected readonly initials = initials;
  protected readonly queueLabel = queueLabel;
  protected readonly formatDate = formatDate;
  protected readonly formatDateTime = formatDateTime;
  protected readonly stageExists = stageExists;

  /** The clock the waiting times are measured against. Reset on every census load. */
  protected readonly now = signal(new Date());

  protected readonly viewOptions: readonly ViewOption[] = [
    { view: 'all', label: 'All approvers', tone: 'default', hint: 'Everything pending, whoever holds it.' },
    {
      view: 'stuck',
      label: 'Needs re-routing',
      tone: 'warn',
      hint: 'Held by a deactivated account or by text that is not a user. It will never move on its own.',
    },
    {
      view: 'deactivated',
      label: 'Deactivated',
      tone: 'warn',
      hint: 'Real accounts that can no longer sign in.',
    },
    {
      view: 'not-a-user',
      label: 'Not a user',
      tone: 'warn',
      hint: 'Leftover dropdown text saved as the approver, e.g. “Please Select”.',
    },
    { view: 'active', label: 'Active', tone: 'ok', hint: 'People who can approve these themselves.' },
  ];

  protected readonly sortOptions: readonly { value: HolderSort; label: string }[] = [
    { value: 'pending', label: 'Most pending' },
    { value: 'waiting', label: 'Waiting longest' },
    { value: 'name', label: 'A–Z' },
  ];

  // ─── State held in the URL ──────────────────────────────────────────────────

  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly view = computed(() => parseView(this.params().get('view')));
  protected readonly table = computed(() => parseTable(this.params().get('table')));
  protected readonly stage = computed(() => parseStage(this.params().get('stage')));
  protected readonly roleId = computed(() => parseRoleId(this.params().get('role')));

  /** The selected approver, compared the way the database compares approver values. */
  protected readonly selectedKey = computed(() => {
    const holder = this.params().get('holder');
    return holder === null ? null : holderKey(holder);
  });

  // ─── Local list state ───────────────────────────────────────────────────────

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly search = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(120), distinctUntilChanged()),
    { initialValue: '' },
  );
  protected readonly sort = signal<HolderSort>('pending');

  // ─── The census ─────────────────────────────────────────────────────────────

  protected readonly censusState = signal<LoadState>('loading');
  protected readonly refreshing = signal(false);
  protected readonly census = signal<readonly ApprovalQueueResponse[]>([]);
  protected readonly loadedAt = signal<Date | null>(null);
  private censusRequest: Subscription | null = null;

  // ─── Roles (the old screen's first dropdown) ────────────────────────────────

  protected readonly roles = signal<readonly RoleResponse[]>([]);
  private readonly roleMembers = signal<ReadonlyMap<number, ReadonlySet<string>>>(new Map());
  private roleRequestId: number | null = null;

  protected readonly roleOptions = computed(() =>
    this.roles()
      .filter((role) => int(role.assignedUserCount) > 0)
      .map((role) => ({
        value: int(role.roleId),
        label: role.roleName,
        hint: role.isActive ? `${int(role.assignedUserCount)}` : 'inactive',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })),
  );

  /** Holder keys carrying the chosen role; null while none is chosen or it is loading. */
  private readonly activeRoleMembers = computed(() => {
    const id = this.roleId();
    return id === null ? null : (this.roleMembers().get(id) ?? null);
  });

  protected readonly roleLoading = computed(() => this.roleId() !== null && this.activeRoleMembers() === null);

  protected readonly roleName = computed(() => {
    const id = this.roleId();
    return this.roleOptions().find((option) => option.value === id)?.label ?? null;
  });

  // ─── Derived: the list ──────────────────────────────────────────────────────

  /** Narrowed by table, level and role — everything except the status view and search. */
  private readonly scoped = computed(() => {
    if (this.roleLoading()) {
      return [];
    }
    const scope = { table: this.table(), stage: this.stage(), roleMembers: this.activeRoleMembers() };
    return this.census().filter((queue) => inScope(queue, scope));
  });

  protected readonly facets = computed(() => viewFacets(this.scoped()));

  private readonly visibleQueues = computed(() => {
    const view = this.view();
    return this.scoped().filter((queue) => inView(queue.holderStatus, view));
  });

  protected readonly holders = computed(() =>
    sortHolders(searchHolders(groupByHolder(this.visibleQueues()), this.search()), this.sort()),
  );

  protected readonly listTotal = computed(() => this.holders().reduce((sum, group) => sum + group.total, 0));

  /** A search that finds nobody in this view, but somebody in All. Offered as a one-click way out. */
  protected readonly matchesElsewhere = computed(() => {
    if (this.view() === 'all' || !this.search().trim() || this.holders().length > 0) {
      return 0;
    }
    return searchHolders(groupByHolder(this.scoped()), this.search()).length;
  });

  protected readonly hasFilters = computed(
    () =>
      this.table() !== null ||
      this.stage() !== null ||
      this.roleId() !== null ||
      this.view() !== 'all' ||
      this.search().trim().length > 0,
  );

  /** Table × level for the overview, honouring the status view and the role but not table/level. */
  protected readonly matrix = computed(() => {
    const view = this.view();
    const members = this.activeRoleMembers();
    return stageMatrix(
      this.census().filter(
        (queue) =>
          inView(queue.holderStatus, view) && (members === null || members.has(holderKey(queue.holder))),
      ),
    );
  });

  private readonly allGroups = computed(() => groupByHolder(this.census()));

  /** What each approver holds in total — shown against every New User candidate. */
  private readonly holdingByKey = computed(() => {
    const totals = new Map<string, number>();
    for (const group of this.allGroups()) {
      totals.set(group.key, group.total);
    }
    return totals;
  });

  // ─── Derived: the selected approver ─────────────────────────────────────────

  /** Every queue the approver holds, whatever the list filters — they only choose the default ticks. */
  protected readonly selected = computed(() => {
    const key = this.selectedKey();
    return key === null ? null : (this.allGroups().find((group) => group.key === key) ?? null);
  });

  protected readonly selectedIsStuck = computed(() => {
    const group = this.selected();
    return group !== null && group.status !== 'Active';
  });

  protected readonly ticked = signal<ReadonlySet<string>>(new Set());
  protected readonly previews = signal<ReadonlyMap<string, PreviewState>>(new Map());
  private readonly previewRequests = new Subject<HolderQueue>();

  private readonly eligibilities = signal<ReadonlyMap<string, EligibilityState>>(new Map());
  private eligibilityRequest: Subscription | null = null;
  private eligibilityRequestKey: string | null = null;

  protected readonly eligibility = computed(() => {
    const group = this.selected();
    return group ? (this.eligibilities().get(group.key) ?? null) : null;
  });

  protected readonly holderRoles = computed(() => (this.eligibility()?.data?.currentHolderRoles ?? []).join(', '));

  protected readonly newHolderId = signal<string | null>(null);
  protected readonly previewTab = signal<string | null>(null);

  private lastSelectedKey: string | null = null;
  private ticksFor: string | null = null;

  /** Ticked queues that still have something in them. A zero-count queue cannot be re-routed. */
  protected readonly tickedQueues = computed(() => {
    const group = this.selected();
    const ticked = this.ticked();
    return group ? group.queues.filter((queue) => ticked.has(queue.key) && this.countOf(queue) > 0) : [];
  });

  protected readonly moveCount = computed(() =>
    this.tickedQueues().reduce((sum, queue) => sum + this.countOf(queue), 0),
  );

  protected readonly candidateOptions = computed<CandidateOption[]>(() => {
    const holding = this.holdingByKey();
    return (this.eligibility()?.data?.candidates ?? []).map((candidate) => ({
      value: candidate.userId,
      label: (candidate.fullName || candidate.userId).trim(),
      login: candidate.userId,
      holding: holding.get(holderKey(candidate.userId)) ?? 0,
    }));
  });

  protected readonly newHolder = computed(
    () => (this.eligibility()?.data?.candidates ?? []).find((c) => c.userId === this.newHolderId()) ?? null,
  );

  protected readonly merges = computed(() => {
    const target = this.newHolder();
    return target ? mergeNotes(this.tickedQueues(), target.userId, this.census()) : [];
  });

  /** The queue whose rows the preview table is showing. */
  protected readonly activePreview = computed(() => {
    const ticked = this.tickedQueues();
    const wanted = this.previewTab();
    return ticked.find((queue) => queue.key === wanted) ?? (ticked.length > 0 ? ticked[0] : null);
  });

  protected readonly activePreviewState = computed(() => {
    const queue = this.activePreview();
    return queue ? (this.previews().get(queue.key) ?? null) : null;
  });

  /** Why the button is off, in words — or null when it is on. */
  protected readonly blocker = computed<string | null>(() => {
    const group = this.selected();
    if (!group) {
      return 'Pick an approver on the left.';
    }
    const ticked = group.queues.filter((queue) => this.ticked().has(queue.key));
    if (ticked.length === 0) {
      return 'Tick at least one queue to move.';
    }
    if (ticked.some((queue) => this.previews().get(queue.key)?.status === 'failed')) {
      return 'A preview did not load. Retry it before re-routing.';
    }
    if (ticked.some((queue) => this.previews().get(queue.key)?.status !== 'ready')) {
      return 'Counting the rows that would move…';
    }
    if (this.tickedQueues().length === 0) {
      return 'Nothing is pending in the ticked queues any more.';
    }
    const eligibility = this.eligibility();
    if (!eligibility || eligibility.status === 'loading') {
      return 'Loading who can take them…';
    }
    if (eligibility.status === 'failed') {
      return 'Could not load who can take them.';
    }
    if (this.candidateOptions().length === 0) {
      return 'Nobody can take these yet — see “Who takes them”.';
    }
    if (!this.newHolder()) {
      return 'Choose who takes them.';
    }
    return null;
  });

  // ─── The run ────────────────────────────────────────────────────────────────

  protected readonly confirming = signal(false);
  protected readonly run = signal<RunState | null>(null);
  protected readonly running = computed(() => {
    const run = this.run();
    return run !== null && !run.done;
  });

  /** The run to show on the panel — only while the approver it moved work off is selected. */
  protected readonly runShown = computed(() => {
    const run = this.run();
    return run && run.fromKey === this.selectedKey() ? run : null;
  });

  protected readonly runMoved = computed(() => runMoved(this.run()));

  protected readonly canRun = computed(() => this.blocker() === null && !this.running());

  protected readonly confirmTitle = computed(() => {
    const count = this.moveCount();
    return `Re-route ${this.fmt(count)} ${count === 1 ? 'approval' : 'approvals'}?`;
  });

  protected readonly confirmMessage = computed(() => {
    const group = this.selected();
    const target = this.newHolder();
    if (!group || !target) {
      return '';
    }
    return (
      `From ${this.withLogin(group)} to ${this.candidateName(target)}. ` +
      'Each queue moves in its own transaction, and only if it still holds exactly the rows ' +
      'counted here — otherwise that queue is left as it is and you are asked to look again.'
    );
  });

  protected readonly confirmDetails = computed<ConfirmDetail[]>(() =>
    this.tickedQueues().map((queue) => ({ label: queueLabel(queue), value: this.fmt(this.countOf(queue)) })),
  );

  protected readonly confirmNote = computed(() => {
    const notes = this.merges();
    const target = this.newHolder();
    if (!target || notes.length === 0) {
      return null;
    }
    const held = notes.map((note) => `${this.fmt(note.existing)} at ${queueLabel(note)}`).join(' and ');
    return (
      `${this.candidateName(target)} already holds ${held}. The two piles merge, and nothing ` +
      'on this screen can tell them apart afterwards.'
    );
  });

  constructor() {
    this.loadCensus();

    this.rolesApi
      .listRoles({ status: 'All' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (roles) => this.roles.set(roles ?? []), error: () => this.roles.set([]) });

    // One preview request at a time — each is a full scan of an approval heap. A request
    // queued for an approver the admin has already left is dropped before it is sent.
    this.previewRequests
      .pipe(
        concatMap((queue) => (this.isWanted(queue) ? this.fetchPreview(queue) : this.forgetPreview(queue))),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();

    effect(() => {
      const key = this.selectedKey();
      const group = this.selected();
      untracked(() => this.onSelection(key, group));
    });

    effect(() => {
      const id = this.roleId();
      if (id !== null) {
        untracked(() => this.loadRoleMembers(id));
      }
    });
  }

  // ─── Census ─────────────────────────────────────────────────────────────────

  private loadCensus(background = false): void {
    this.censusRequest?.unsubscribe();
    if (background) {
      this.refreshing.set(true);
    } else {
      this.censusState.set('loading');
    }
    this.censusRequest = this.api
      .approvalQueueCensus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (queues) => {
          this.census.set(queues);
          this.loadedAt.set(new Date());
          this.now.set(new Date());
          this.censusState.set('ready');
          this.refreshing.set(false);
        },
        error: () => {
          if (!background) {
            this.censusState.set('failed');
          }
          this.refreshing.set(false);
        },
      });
  }

  /** Re-reads everything live: the census, and the selected approver's previews. */
  protected refresh(): void {
    if (this.running()) {
      return;
    }
    this.previews.set(new Map());
    this.eligibilities.set(new Map());
    this.eligibilityRequest?.unsubscribe();
    this.eligibilityRequestKey = null;
    this.loadCensus(this.censusState() === 'ready');
  }

  protected retryCensus(): void {
    this.loadCensus();
  }

  // ─── Filters (URL) ──────────────────────────────────────────────────────────

  private setParams(patch: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected setView(view: HolderView): void {
    this.setParams({ view: view === 'all' ? null : view });
  }

  protected setTable(table: ApprovalTable | null): void {
    this.setParams({ table: tableToken(table === this.table() ? null : table) });
  }

  protected setStage(stage: ApprovalStage | null): void {
    this.setParams({ stage: stageToken(stage === this.stage() ? null : stage) });
  }

  protected setRole(roleId: number | null): void {
    this.setParams({ role: roleId === null ? null : String(roleId) });
  }

  /** A matrix cell is the old Table Name + Level pair, chosen in one click. */
  protected pickCell(cell: MatrixCell): void {
    const same = this.table() === cell.table && this.stage() === cell.stage;
    this.setParams({
      table: same ? null : tableToken(cell.table),
      stage: same ? null : stageToken(cell.stage),
    });
  }

  protected clearFilters(): void {
    this.searchControl.setValue('');
    this.setParams({ view: null, table: null, stage: null, role: null });
  }

  protected showAllView(): void {
    this.setView('all');
  }

  protected setSort(sort: HolderSort): void {
    this.sort.set(sort);
  }

  private loadRoleMembers(roleId: number): void {
    if (this.roleMembers().has(roleId) || this.roleRequestId === roleId) {
      return;
    }
    this.roleRequestId = roleId;
    this.rolesApi
      .roleMemberIds(roleId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ids) => {
          this.roleRequestId = null;
          this.roleMembers.update((all) => new Map(all).set(roleId, new Set(ids.map(holderKey))));
        },
        error: () => {
          // The interceptor has said why. Drop the filter rather than leave the list empty.
          this.roleRequestId = null;
          if (this.roleId() === roleId) {
            this.setRole(null);
          }
        },
      });
  }

  // ─── Selection ──────────────────────────────────────────────────────────────

  protected selectHolder(group: HolderGroup): void {
    if (!group.targetable || this.running()) {
      return;
    }
    this.setParams({ holder: group.holder });
  }

  protected closeHolder(): void {
    if (this.running()) {
      return;
    }
    this.run.set(null);
    this.setParams({ holder: null });
  }

  /** Arrow keys walk the list, as in an inbox. */
  protected onListKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    const list = this.holders().filter((group) => group.targetable);
    if (list.length === 0) {
      return;
    }
    const index = list.findIndex((group) => group.key === this.selectedKey());
    const next =
      index === -1
        ? list[0]
        : list[Math.min(list.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    this.selectHolder(next);
    document.getElementById(this.holderDomId(next))?.focus();
  }

  protected holderDomId(group: HolderGroup): string {
    return `rr-holder-${this.holders().indexOf(group)}`;
  }

  /**
   * Runs whenever the selected approver or the census changes.
   *
   * A new approver resets the choices; the same approver after a census refresh keeps them.
   * Either way the previews and the eligible list are made sure of — both are cached, so
   * this is a no-op for anything already loaded.
   */
  private onSelection(key: string | null, group: HolderGroup | null): void {
    if (key !== this.lastSelectedKey) {
      this.lastSelectedKey = key;
      this.ticksFor = null;
      this.newHolderId.set(null);
      this.previewTab.set(null);
      if (this.run()?.done) {
        this.run.set(null);
      }
    }

    if (!group || !group.targetable) {
      return;
    }

    if (this.ticksFor !== group.key) {
      this.ticksFor = group.key;
      this.ticked.set(new Set(this.defaultTicks(group)));
    }

    this.ensureEligibility(group);
    for (const queue of group.queues) {
      this.ensurePreview(queue);
    }
  }

  /**
   * Which queues start ticked: those the list filters point at, or all of them.
   *
   * Someone who filtered to Budget · Level 1 and then picked an approver means that queue;
   * someone who did not means "everything this person is holding" — the common reason for
   * being here is that the person has left.
   */
  private defaultTicks(group: HolderGroup): string[] {
    const table = this.table();
    const stage = this.stage();
    const matching = group.queues.filter(
      (queue) => (table === null || queue.table === table) && (stage === null || queue.stage === stage),
    );
    return (matching.length > 0 ? matching : group.queues).map((queue) => queue.key);
  }

  protected toggleQueue(queue: HolderQueue): void {
    if (this.running()) {
      return;
    }
    this.ticked.update((current) => {
      const next = new Set(current);
      if (!next.delete(queue.key)) {
        next.add(queue.key);
      }
      return next;
    });
  }

  protected isTicked(queue: HolderQueue): boolean {
    return this.ticked().has(queue.key);
  }

  protected setNewHolder(userId: string | null): void {
    this.newHolderId.set(userId);
  }

  // ─── Previews ───────────────────────────────────────────────────────────────

  protected previewOf(queue: HolderQueue): PreviewState | null {
    return this.previews().get(queue.key) ?? null;
  }

  /** The live count once previewed; the census figure until then. */
  protected countOf(queue: HolderQueue): number {
    const preview = this.previews().get(queue.key);
    return preview?.status === 'ready' ? preview.total : queue.pendingCount;
  }

  private ensurePreview(queue: HolderQueue): void {
    if (this.previews().has(queue.key)) {
      return;
    }
    this.setPreview(queue.key, { status: 'loading', rows: [], total: 0, nextCursor: null, loadingMore: false });
    this.previewRequests.next(queue);
  }

  private isWanted(queue: HolderQueue): boolean {
    return this.selectedKey() === holderKey(queue.holder);
  }

  private forgetPreview(queue: HolderQueue): Observable<never> {
    if (this.previews().get(queue.key)?.status === 'loading') {
      this.previews.update((all) => {
        const next = new Map(all);
        next.delete(queue.key);
        return next;
      });
    }
    return EMPTY;
  }

  private fetchPreview(queue: HolderQueue): Observable<unknown> {
    return this.api
      .pendingApprovals({ table: queue.table, stage: queue.stage, holder: queue.holder, pageSize: PREVIEW_PAGE })
      .pipe(
        tap((page) =>
          this.setPreview(queue.key, {
            status: 'ready',
            rows: page.items ?? [],
            total: int(page.totalCount),
            nextCursor: page.nextCursor ?? null,
            loadingMore: false,
          }),
        ),
        catchError(() => {
          this.setPreview(queue.key, { status: 'failed', rows: [], total: 0, nextCursor: null, loadingMore: false });
          return EMPTY;
        }),
      );
  }

  protected retryPreview(queue: HolderQueue): void {
    this.previews.update((all) => {
      const next = new Map(all);
      next.delete(queue.key);
      return next;
    });
    this.ensurePreview(queue);
  }

  protected loadMore(queue: HolderQueue): void {
    const state = this.previews().get(queue.key);
    if (!state?.nextCursor || state.loadingMore) {
      return;
    }
    this.setPreview(queue.key, { ...state, loadingMore: true });
    this.api
      .pendingApprovals({
        table: queue.table,
        stage: queue.stage,
        holder: queue.holder,
        pageSize: PREVIEW_PAGE,
        cursor: state.nextCursor,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          const current = this.previews().get(queue.key) ?? state;
          this.setPreview(queue.key, {
            status: 'ready',
            rows: [...current.rows, ...(page.items ?? [])],
            // The newest look at the queue wins: this is what the write will be held to.
            total: int(page.totalCount),
            nextCursor: page.nextCursor ?? null,
            loadingMore: false,
          });
        },
        error: () => {
          const current = this.previews().get(queue.key) ?? state;
          this.setPreview(queue.key, { ...current, loadingMore: false });
        },
      });
  }

  private setPreview(key: string, state: PreviewState): void {
    this.previews.update((all) => new Map(all).set(key, state));
  }

  // ─── Who may take it ────────────────────────────────────────────────────────

  private ensureEligibility(group: HolderGroup): void {
    if (this.eligibilities().has(group.key)) {
      return;
    }

    // A request still running for the previous approver is cancelled, and its placeholder
    // dropped so that coming back to them asks again rather than waiting forever.
    if (this.eligibilityRequest && this.eligibilityRequestKey !== group.key) {
      this.eligibilityRequest.unsubscribe();
      const stale = this.eligibilityRequestKey;
      if (stale !== null && this.eligibilities().get(stale)?.status === 'loading') {
        this.eligibilities.update((all) => {
          const next = new Map(all);
          next.delete(stale);
          return next;
        });
      }
    }

    this.setEligibility(group.key, { status: 'loading', data: null });
    this.eligibilityRequestKey = group.key;
    this.eligibilityRequest = this.api
      .eligibleReRouteHolders(group.holder)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.setEligibility(group.key, {
            status: 'ready',
            data: { ...data, candidates: data.candidates ?? [], currentHolderRoles: data.currentHolderRoles ?? [] },
          });
          this.eligibilityRequestKey = null;
        },
        error: () => {
          this.setEligibility(group.key, { status: 'failed', data: null });
          this.eligibilityRequestKey = null;
        },
      });
  }

  protected retryEligibility(): void {
    const group = this.selected();
    if (!group) {
      return;
    }
    this.eligibilities.update((all) => {
      const next = new Map(all);
      next.delete(group.key);
      return next;
    });
    this.ensureEligibility(group);
  }

  private setEligibility(key: string, state: EligibilityState): void {
    this.eligibilities.update((all) => new Map(all).set(key, state));
  }

  // ─── Re-route ───────────────────────────────────────────────────────────────

  protected askToConfirm(): void {
    if (this.canRun()) {
      this.confirming.set(true);
    }
  }

  /**
   * Moves the ticked queues one after another, each with its own previewed count.
   *
   * Sequential rather than parallel: each write scans and locks a heap, and two against the
   * same table would only queue behind each other on the server anyway. One failing does not
   * stop the rest — they are independent queues, and each line reports its own outcome.
   */
  protected confirmRun(): void {
    this.confirming.set(false);
    const group = this.selected();
    const target = this.newHolder();
    if (!group || !target || !this.canRun()) {
      return;
    }

    const lines: RunLine[] = this.tickedQueues().map((queue) => ({
      key: queue.key,
      table: queue.table,
      stage: queue.stage,
      holder: queue.holder,
      expected: this.countOf(queue),
      state: 'waiting',
      moved: 0,
      message: '',
      movedKeys: [],
      keysTruncated: false,
    }));

    this.run.set({ fromKey: group.key, fromName: this.withLogin(group), to: target, lines, done: false });

    from(lines)
      .pipe(
        concatMap((line) => {
          this.patchLine(line.key, { state: 'moving' });
          return this.api
            .reRoute({
              table: line.table,
              stage: line.stage,
              currentHolder: line.holder,
              newHolder: target.userId,
              expectedCount: line.expected,
            })
            .pipe(
              map((response) => ({
                key: line.key,
                patch: {
                  state: 'moved' as const,
                  moved: int(response.movedCount),
                  movedKeys: response.movedKeys ?? [],
                  keysTruncated: response.keysTruncated === true,
                },
              })),
              catchError((error: unknown) => of({ key: line.key, patch: this.failure(error, line.expected) })),
            );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ key, patch }) => this.patchLine(key, patch),
        complete: () => this.finishRun(),
      });
  }

  private failure(error: unknown, expected: number): Partial<RunLine> {
    if (error instanceof HttpErrorResponse) {
      const change = countChange(error.error);
      if (change) {
        return {
          state: 'changed',
          message: Number.isFinite(change.actual)
            ? `Changed since you looked: ${this.fmt(expected)} counted, ${this.fmt(change.actual)} there now. Nothing moved.`
            : 'Changed since you looked. Nothing moved.',
        };
      }
      if (error.status === 429) {
        return {
          state: 'failed',
          message: 'Too many requests in the last minute. Nothing moved — wait a moment and try again.',
        };
      }
      return { state: 'failed', message: messageFor(error) };
    }
    return { state: 'failed', message: 'Something went wrong. Nothing moved.' };
  }

  private patchLine(key: string, patch: Partial<RunLine>): void {
    this.run.update((run) =>
      run ? { ...run, lines: run.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) } : run,
    );
  }

  private finishRun(): void {
    this.run.update((run) => (run ? { ...run, done: true } : run));
    const run = this.run();
    if (!run) {
      return;
    }

    // Both ends of every line are stale now: the queue that was emptied and the pile it
    // landed on. Dropping them makes the panel re-count whatever it shows next.
    this.previews.update((all) => {
      const next = new Map(all);
      for (const line of run.lines) {
        next.delete(line.key);
        next.delete(queueKey({ table: line.table, stage: line.stage, holder: run.to.userId }));
      }
      return next;
    });

    const moved = this.runMoved();
    if (moved > 0) {
      this.notifications.success(
        `${this.fmt(moved)} ${moved === 1 ? 'approval' : 'approvals'} re-routed to ${this.candidateName(run.to)}.`,
      );
    }
    this.loadCensus(true);
  }

  /** Back to the approver: whatever did not move is re-counted and can be tried again. */
  protected dismissRun(): void {
    if (this.running()) {
      return;
    }
    this.run.set(null);
    if (!this.selected()) {
      this.setParams({ holder: null });
    }
  }

  /** Open the approver the work went to — "did it land?" answered on the same screen. */
  protected openRecipient(): void {
    const run = this.run();
    if (!run || this.running()) {
      return;
    }
    this.run.set(null);
    this.setParams({ holder: run.to.userId, view: null, table: null, stage: null, role: null });
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  /** The queues behind the list as shown — every filter, the role and the search included. */
  protected exportCsv(): void {
    const keys = new Set(this.holders().map((group) => group.key));
    const rows = this.visibleQueues().filter((queue) => keys.has(holderKey(queue.holder)));
    const blob = new Blob(['﻿', censusCsv(rows)], { type: 'text/csv;charset=utf-8' });
    saveBlob(blob, csvFilename('trade-octane-re-route-queues'));
  }

  // ─── Formatting ─────────────────────────────────────────────────────────────

  protected readonly fmt = formatCount;

  protected waited(iso: string | null): string {
    return waited(iso, this.now());
  }

  protected loadedAtLabel(): string {
    const at = this.loadedAt();
    return at ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(at) : '';
  }

  protected statusLabel(group: HolderGroup): string {
    switch (group.status) {
      case 'Active':
        return 'Active';
      case 'Deactivated':
        return 'Deactivated';
      case 'NotAUser':
        return 'Not a user';
    }
  }

  /** The second line under a name: the login for a person, what the text is for anything else. */
  protected subLabel(group: HolderGroup): string {
    if (group.status === 'NotAUser') {
      return group.targetable ? 'Stored text, not an account' : 'No approver recorded';
    }
    return group.holder;
  }

  protected queuesSummary(group: HolderGroup): string {
    return group.queues.map((queue) => `${this.tableShort[queue.table]} ${this.stageShort(queue.stage)}`).join(' · ');
  }

  protected stageShort(stage: ApprovalStage): string {
    return stage === 'Rmc' ? 'RMC' : `L${stage.slice(-1)}`;
  }

  /** "Sheikh Kashif Ahmed (skahmed)" — a shared name must not pass a confirmation. */
  private withLogin(group: HolderGroup): string {
    return group.status === 'NotAUser' || !group.fullName
      ? displayName(group)
      : `${group.fullName} (${group.holder})`;
  }

  protected readonly candidateName = candidateLabel;

  protected viewFacet(view: HolderView) {
    return this.facets()[view];
  }

  /** Legacy's own Re-Route screen wrote this into approver columns when no new user was picked. */
  protected isLegacyPlaceholder(group: HolderGroup): boolean {
    return group.holder.trim().toUpperCase() === 'SELECT NEW USER';
  }
}
