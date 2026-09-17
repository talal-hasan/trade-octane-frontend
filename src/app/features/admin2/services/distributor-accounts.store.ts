import { Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { DistributorAccountResponse } from '../../../core/api/admin2.models';
import { Admin2DistributorsApi } from './admin2-distributors.api';

/**
 * Every distributor account, held for the session.
 *
 * The directory is small — about 520 accounts — and the API returns it whole, with no
 * cursor. So the grid loads it once with `status=All` and does its status tabs, search,
 * sort and paging in memory: switching a tab or typing a search never waits on the
 * network.
 *
 * Held here rather than in the list component so that going list → form → list does not
 * blank the grid behind a skeleton. The list shows what it has at once and revalidates in
 * the background; a write patches the one row it returned instead of refetching 520.
 */
@Injectable({ providedIn: 'root' })
export class DistributorAccountsStore {
  private readonly api = inject(Admin2DistributorsApi);

  private readonly rowsState = signal<readonly DistributorAccountResponse[]>([]);
  private readonly loadedState = signal(false);
  private readonly failedState = signal(false);
  private readonly refreshingState = signal(false);
  private inFlight: Subscription | null = null;
  /**
   * Rows written while a refresh was in flight. That response was read before the write,
   * so without re-applying these it would put back the state the admin just changed.
   */
  private readonly writtenDuringRefresh = new Map<string, DistributorAccountResponse>();

  /** Ordered by distributor id, as the server returns them. */
  readonly rows = this.rowsState.asReadonly();
  /** True once any load has succeeded. Until then there is nothing to show but a skeleton. */
  readonly loaded = this.loadedState.asReadonly();
  /** The last load failed. Only worth a full error state when nothing was loaded before it. */
  readonly failed = this.failedState.asReadonly();
  readonly refreshing = this.refreshingState.asReadonly();

  /** Fetches the directory. A call while one is already in flight joins it. */
  refresh(): void {
    if (this.inFlight && !this.inFlight.closed) {
      return;
    }
    this.refreshingState.set(true);
    this.failedState.set(false);

    this.writtenDuringRefresh.clear();

    this.inFlight = this.api.list('All').subscribe({
      next: (rows) => {
        const written = [...this.writtenDuringRefresh.values()];
        this.rowsState.set(rows);
        // Still inside the subscription, so these upserts record themselves again — hence
        // clearing afterwards rather than before.
        written.forEach((account) => this.upsert(account));
        this.writtenDuringRefresh.clear();
        this.loadedState.set(true);
        this.refreshingState.set(false);
      },
      // The error interceptor has already raised the toast. Rows already on screen stay.
      error: () => {
        this.writtenDuringRefresh.clear();
        this.failedState.set(true);
        this.refreshingState.set(false);
      },
    });
  }

  byId(distributorId: string): DistributorAccountResponse | undefined {
    return this.rowsState().find((row) => row.distributorId === distributorId);
  }

  /** Replaces the row a write returned, or inserts a new account in id order. */
  upsert(account: DistributorAccountResponse): void {
    if (this.inFlight && !this.inFlight.closed) {
      this.writtenDuringRefresh.set(account.distributorId, account);
    }
    this.rowsState.update((rows) => {
      const index = rows.findIndex((row) => row.distributorId === account.distributorId);
      if (index >= 0) {
        const next = [...rows];
        next[index] = account;
        return next;
      }
      const insertAt = rows.findIndex((row) => row.distributorId.localeCompare(account.distributorId) > 0);
      return insertAt < 0 ? [...rows, account] : [...rows.slice(0, insertAt), account, ...rows.slice(insertAt)];
    });
  }
}
