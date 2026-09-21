import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client.service';
import { unwrapData } from '../../../core/api/api.types';
import {
  ResignationResponse,
  ResignationWrapperResponse,
  SetResignationRequest,
  SetResignationResponse,
  SetResignationWrapperResponse,
} from '../../../core/api/admin.models';

/**
 * `Administration 1.0 / Update Resignation` — the endpoints behind `UpdateResignation.aspx`.
 *
 * Only the per-account verbs are wrapped here, because that is what the screen is: the
 * Resignation tab of a user, reached with the user already chosen. The list endpoint
 * (`GET /admin/resignations`, with `recorded=NotRecorded` and `suspectOnly=true`) and its
 * CSV export exist on the server and answer directory-wide questions — "who has left and
 * has not been recorded", "which stored dates may be transposed". Neither has a screen
 * yet; add them here when one is built, rather than now as methods nothing calls.
 *
 * **Dates cross this boundary as `yyyy-MM-dd` and nothing else.** The legacy screen sent
 * `dd-MM-yyyy` as free text inside the SQL statement and let the server guess, which
 * silently stored the 5th of March as the 3rd of May whenever the day was 12 or below. An
 * ISO date bound as a parameter is what closed that, so no formatting decision belongs
 * between this service and the input the administrator types into.
 */
@Injectable({ providedIn: 'root' })
export class AdminResignationsApi {
  private readonly api = inject(ApiClient);

  private path(userId: string): string {
    return `/admin/resignations/${encodeURIComponent(userId)}`;
  }

  /**
   * One account's recorded date and its provenance flags.
   *
   * Replaces the legacy grid's Edit button, which selected the account in the dropdown and
   * then *blanked* the date box — hiding the currently recorded value, which is the one
   * fact needed to decide whether to change it.
   */
  get(userId: string): Observable<ResignationResponse> {
    return this.api
      .get<ResignationResponse | ResignationWrapperResponse>(this.path(userId))
      .pipe(map(unwrapData));
  }

  /** Records or corrects the date. `resignationDate` is `yyyy-MM-dd`. */
  set(userId: string, resignationDate: string): Observable<SetResignationResponse> {
    const body: SetResignationRequest = { resignationDate };
    return this.api
      .put<SetResignationResponse | SetResignationWrapperResponse>(this.path(userId), body)
      .pipe(map(unwrapData));
  }

  /**
   * Removes the recorded date.
   *
   * A separate verb rather than a null in the PUT body — see `SetResignationRequest`. The
   * response carries what was cleared, which is the point on this screen: an administrator
   * undoing a date entered under the legacy format bug needs to see the value that went.
   */
  clear(userId: string): Observable<SetResignationResponse> {
    return this.api
      .delete<SetResignationResponse | SetResignationWrapperResponse>(this.path(userId))
      .pipe(map(unwrapData));
  }
}
