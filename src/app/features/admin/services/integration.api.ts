import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient, Query } from '../../../core/api/api-client.service';
import { unwrapData } from '../../../core/api/api.types';
import {
  BatchSummaryResponse,
  IntegrationRunKind,
  IntegrationRunPageResponse,
  IntegrationRunResponse,
  IntegrationRunState,
  RunAcceptedResponse,
  StartAutoDaReleaseRequest,
  StartBatchPushRequest,
} from '../../../core/api/operations.models';

/**
 * `Integration 1.0` — Auto-DA releases and batch-status pushes to SAP/Salesflo.
 *
 * Runs are **asynchronous**: starting one returns `202` with a `runId`, and progress is
 * read back from `/integration/runs/{runId}`. The UI therefore polls rather than waiting on
 * the start call, and every start offers a `dryRun` — for an integration that posts to SAP,
 * being able to see what *would* happen before it does is the difference between a safe
 * screen and a dangerous one.
 */
@Injectable({ providedIn: 'root' })
export class IntegrationApi {
  private readonly api = inject(ApiClient);

  // ─── Runs ───────────────────────────────────────────────────────────────────

  runs(query: { kind?: IntegrationRunKind; state?: IntegrationRunState; take?: number } = {}): Observable<IntegrationRunPageResponse> {
    return this.api
      .get<IntegrationRunPageResponse | { data: IntegrationRunPageResponse }>(
        '/integration/runs',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  run(runId: string): Observable<IntegrationRunResponse> {
    return this.api
      .get<IntegrationRunResponse | { data: IntegrationRunResponse }>(
        `/integration/runs/${encodeURIComponent(runId)}`,
      )
      .pipe(map(unwrapData));
  }

  // ─── Auto-DA ────────────────────────────────────────────────────────────────

  autoDaDelivery(deliveryNumber: string): Observable<unknown> {
    return this.api
      .get<unknown>(`/integration/autoda/deliveries/${encodeURIComponent(deliveryNumber)}`)
      .pipe(map((response) => unwrapData(response)));
  }

  startAutoDaRelease(request: StartAutoDaReleaseRequest): Observable<RunAcceptedResponse> {
    return this.api
      .post<RunAcceptedResponse | { data: RunAcceptedResponse }>('/integration/autoda/runs', request)
      .pipe(map(unwrapData));
  }

  // ─── Batch status ───────────────────────────────────────────────────────────

  batches(query: { lookbackDays?: number; search?: string } = {}): Observable<BatchSummaryResponse> {
    return this.api
      .get<BatchSummaryResponse | { data: BatchSummaryResponse }>(
        '/integration/batches',
        query as Query,
      )
      .pipe(map(unwrapData));
  }

  startBatchPush(request: StartBatchPushRequest): Observable<RunAcceptedResponse> {
    return this.api
      .post<RunAcceptedResponse | { data: RunAcceptedResponse }>(
        '/integration/batches/runs',
        request,
      )
      .pipe(map(unwrapData));
  }
}
