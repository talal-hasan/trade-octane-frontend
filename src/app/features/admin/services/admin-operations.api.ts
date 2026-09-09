import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { unwrapData } from '../../../core/api/api.types';
import {
  ActivityCandidateResponse,
  ActivityCandidateScope,
  ActivityFilterCatalogueResponse,
  ActivityKey,
  ActivityLogActorGroup,
  ActivityLogActorResponse,
  ActivityLogPageResponse,
  ActivityLogSortField,
  ActivityPageResponse,
  ActivityScopeResponse,
  ActivitySortField,
  ApprovalQueuePageResponse,
  ApprovalQueueSortField,
  ApprovalStage,
  ApprovalTable,
  BudgetFilterCatalogueResponse,
  BudgetProductResponse,
  BudgetScopeResponse,
  BudgetShellPageResponse,
  BudgetShellSortField,
  FrequencyConfigurationResponse,
  FrequencyConfigurationWriteResponse,
  FrequencyGroupResponse,
  FrequencySchemeResponse,
  HolderStatus,
  PendingApprovalPageResponse,
  ReRouteRequest,
  ReRouteResponse,
  TransferActivityOwnershipRequest,
  TransferActivityOwnershipResponse,
  TransferBudgetOwnershipRequest,
  TransferBudgetOwnershipResponse,
} from '../../../core/api/operations.models';

export interface ApprovalQueueQuery {
  table?: ApprovalTable;
  stage?: ApprovalStage;
  search?: string;
  holderStatus?: HolderStatus;
  /** Only queues held by someone who cannot act on them. */
  stuckOnly?: boolean;
  sort?: ApprovalQueueSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

export interface BudgetScopeQuery {
  year?: number;
  month?: number;
  schemeId?: string[];
  regionCode?: string[];
}

export interface BudgetShellQuery extends BudgetScopeQuery {
  tableName?: string;
  product?: string[];
  currentOwner?: string;
  search?: string;
  ownerStatus?: string;
  driftedOnly?: boolean;
  sort?: BudgetShellSortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

export interface ActivityListQuery {
  year?: number;
  month?: number;
  claimType?: string;
  currentOwner?: string;
  search?: string;
  driftedOnly?: boolean;
  sort?: ActivitySortField;
  desc?: boolean;
  pageSize?: number;
  cursor?: string | null;
}

export interface ActivityLogQuery {
  search?: string;
  userId?: string;
  actorGroup?: ActivityLogActorGroup;
  from?: string;
  to?: string;
  activity?: string;
  tableName?: string;
  sort?: ActivityLogSortField;
  desc?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * The operational Administration endpoints: moving pending work between people, and the
 * reports over it.
 *
 * Every transfer here takes an `expectedCount` drawn from a preview the user just looked
 * at. The server compares it against the row count of its own UPDATE and rolls the whole
 * thing back with a 409 if they differ, so a queue that changed under the admin is never
 * half-moved. Callers must pass the count from the preview they showed — never a
 * recomputed or assumed one, which would defeat the guard entirely.
 */
@Injectable({ providedIn: 'root' })
export class AdminOperationsApi {
  private readonly api = inject(ApiClient);

  // ─── Re-Route Scheme ────────────────────────────────────────────────────────

  approvalQueues(query: ApprovalQueueQuery = {}): Observable<ApprovalQueuePageResponse> {
    return this.api
      .get<ApprovalQueuePageResponse | { data: ApprovalQueuePageResponse }>(
        '/admin/re-route/queues',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  exportApprovalQueues(query: Omit<ApprovalQueueQuery, 'pageSize' | 'cursor'> = {}): Observable<Blob> {
    return this.api.downloadCsv('/admin/re-route/queues/export', query as Query);
  }

  /** The rows a re-route would move — the preview `expectedCount` comes from. */
  pendingApprovals(query: {
    table?: ApprovalTable;
    stage?: ApprovalStage;
    holder?: string;
    pageSize?: number;
    cursor?: string | null;
  }): Observable<PendingApprovalPageResponse> {
    return this.api
      .get<PendingApprovalPageResponse | { data: PendingApprovalPageResponse }>(
        '/admin/re-route/pending',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  reRoute(request: ReRouteRequest, allowInactiveNewHolder = false): Observable<ReRouteResponse> {
    return this.api
      .post<ReRouteResponse | { data: ReRouteResponse }>('/admin/re-route', request, {
        allowInactiveNewHolder,
      })
      .pipe(map(unwrapData));
  }

  // ─── Change Budget Ownership ────────────────────────────────────────────────

  budgetFilters(): Observable<BudgetFilterCatalogueResponse> {
    return this.api
      .get<BudgetFilterCatalogueResponse | { data: BudgetFilterCatalogueResponse }>(
        '/admin/budget-ownership/filters',
      )
      .pipe(map(unwrapData));
  }

  /** Which tables hold budgets, who owns them, who may receive them — one call. */
  budgetScope(query: BudgetScopeQuery): Observable<BudgetScopeResponse> {
    return this.api
      .get<BudgetScopeResponse | { data: BudgetScopeResponse }>(
        '/admin/budget-ownership/scope',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  budgetProducts(query: BudgetShellQuery): Observable<BudgetProductResponse[]> {
    return this.api
      .get<BudgetProductResponse[] | { data: BudgetProductResponse[] }>(
        '/admin/budget-ownership/products',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  budgetShells(query: BudgetShellQuery): Observable<BudgetShellPageResponse> {
    return this.api
      .get<BudgetShellPageResponse | { data: BudgetShellPageResponse }>(
        '/admin/budget-ownership/shells',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  exportBudgetShells(query: Omit<BudgetShellQuery, 'pageSize' | 'cursor'>): Observable<Blob> {
    return this.api.downloadCsv('/admin/budget-ownership/shells/export', query as Query);
  }

  transferBudgetOwnership(
    request: TransferBudgetOwnershipRequest,
    allowInactiveNewOwner = false,
  ): Observable<TransferBudgetOwnershipResponse> {
    return this.api
      .post<TransferBudgetOwnershipResponse | { data: TransferBudgetOwnershipResponse }>(
        '/admin/budget-ownership/transfer',
        request,
        { allowInactiveNewOwner },
      )
      .pipe(map(unwrapData));
  }

  // ─── Change Activity Ownership ──────────────────────────────────────────────

  activityFilters(): Observable<ActivityFilterCatalogueResponse> {
    return this.api
      .get<ActivityFilterCatalogueResponse | { data: ActivityFilterCatalogueResponse }>(
        '/admin/activity-ownership/filters',
      )
      .pipe(map(unwrapData));
  }

  activityOwners(query: {
    year?: number;
    month?: number;
    claimType?: string;
  }): Observable<ActivityScopeResponse> {
    return this.api
      .get<ActivityScopeResponse | { data: ActivityScopeResponse }>(
        '/admin/activity-ownership/owners',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  activityCandidates(
    currentOwner: string,
    scope?: ActivityCandidateScope,
  ): Observable<ActivityCandidateResponse> {
    return this.api
      .get<ActivityCandidateResponse | { data: ActivityCandidateResponse }>(
        '/admin/activity-ownership/candidates',
        { currentOwner, scope } as Query,
      )
      .pipe(map(unwrapData));
  }

  activities(query: ActivityListQuery): Observable<ActivityPageResponse> {
    return this.api
      .get<ActivityPageResponse | { data: ActivityPageResponse }>(
        '/admin/activity-ownership/activities',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  exportActivities(query: Omit<ActivityListQuery, 'pageSize' | 'cursor'>): Observable<Blob> {
    return this.api.downloadCsv('/admin/activity-ownership/activities/export', query as Query);
  }

  transferActivityOwnership(
    request: TransferActivityOwnershipRequest,
    allowInactiveNewOwner = false,
  ): Observable<TransferActivityOwnershipResponse> {
    return this.api
      .post<TransferActivityOwnershipResponse | { data: TransferActivityOwnershipResponse }>(
        '/admin/activity-ownership/transfer',
        request,
        { allowInactiveNewOwner },
      )
      .pipe(map(unwrapData));
  }

  /** Convenience for building a transfer request from selected rows. */
  toActivityKeys(rows: readonly { mpCode: string; seqId: string }[]): ActivityKey[] {
    return rows.map((row) => ({ mpCode: row.mpCode, seqId: row.seqId }));
  }

  // ─── Activity Logs ──────────────────────────────────────────────────────────

  activityLogActors(group?: ActivityLogActorGroup): Observable<ActivityLogActorResponse[]> {
    return this.api
      .get<ActivityLogActorResponse[] | { data: ActivityLogActorResponse[] }>(
        '/admin/activity-logs/actors',
        { group } as Query,
      )
      .pipe(map(unwrapData));
  }

  activityLogs(query: ActivityLogQuery = {}): Observable<ActivityLogPageResponse> {
    return this.api
      .get<ActivityLogPageResponse | { data: ActivityLogPageResponse }>(
        '/admin/activity-logs',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  exportActivityLogs(query: Omit<ActivityLogQuery, 'page' | 'pageSize'> = {}): Observable<Blob> {
    return this.api.downloadCsv('/admin/activity-logs/export', query as Query);
  }

  // ─── Frequency Configuration ────────────────────────────────────────────────

  frequencyConfigurations(query: {
    search?: string;
    groupKey?: string;
    schemeId?: string;
    activeOnly?: boolean;
  } = {}): Observable<FrequencyConfigurationResponse[]> {
    return this.api
      .get<FrequencyConfigurationResponse[] | { data: FrequencyConfigurationResponse[] }>(
        '/admin/frequency-configurations',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  frequencyGroups(): Observable<FrequencyGroupResponse[]> {
    return this.api
      .get<FrequencyGroupResponse[] | { data: FrequencyGroupResponse[] }>(
        '/admin/frequency-configurations/groups',
      )
      .pipe(map(unwrapData));
  }

  frequencySchemeTypes(): Observable<FrequencySchemeResponse[]> {
    return this.api
      .get<FrequencySchemeResponse[] | { data: FrequencySchemeResponse[] }>(
        '/admin/frequency-configurations/scheme-types',
      )
      .pipe(map(unwrapData));
  }

  exportFrequencyConfigurations(query: { search?: string; groupKey?: string } = {}): Observable<Blob> {
    return this.api.downloadCsv('/admin/frequency-configurations/export', query as Query);
  }

  updateFrequency(
    schemeId: string,
    frequencyGt: number,
    frequencyFsd: number,
  ): Observable<FrequencyConfigurationWriteResponse> {
    return this.api
      .put<FrequencyConfigurationWriteResponse | { data: FrequencyConfigurationWriteResponse }>(
        `/admin/frequency-configurations/${encodeURIComponent(schemeId)}/frequency`,
        { frequencyGt, frequencyFsd },
      )
      .pipe(map(unwrapData));
  }

  updateAccrual(
    schemeId: string,
    forAccruals: number,
  ): Observable<FrequencyConfigurationWriteResponse> {
    return this.api
      .put<FrequencyConfigurationWriteResponse | { data: FrequencyConfigurationWriteResponse }>(
        `/admin/frequency-configurations/${encodeURIComponent(schemeId)}/accrual`,
        { forAccruals },
      )
      .pipe(map(unwrapData));
  }

  updateBudgetPriorMonths(
    schemeIds: readonly string[],
    months: number,
  ): Observable<FrequencyConfigurationWriteResponse> {
    return this.api
      .put<FrequencyConfigurationWriteResponse | { data: FrequencyConfigurationWriteResponse }>(
        '/admin/frequency-configurations/budget-prior-months',
        { schemeIds: [...schemeIds], months },
      )
      .pipe(map(unwrapData));
  }

  updateClaimPriorMonths(
    schemeIds: readonly string[],
    months: number,
  ): Observable<FrequencyConfigurationWriteResponse> {
    return this.api
      .put<FrequencyConfigurationWriteResponse | { data: FrequencyConfigurationWriteResponse }>(
        '/admin/frequency-configurations/claim-prior-months',
        { schemeIds: [...schemeIds], months },
      )
      .pipe(map(unwrapData));
  }
}
