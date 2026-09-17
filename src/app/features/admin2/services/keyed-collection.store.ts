import { signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

/**
 * A small Administration 2.0 collection, held for the session.
 *
 * The 2.0 catalogues are small (33 roles, ~520 distributor accounts) and their list
 * endpoints return everything with no cursor. So a screen loads its collection once and
 * filters, sorts and pages it in memory, and going list → form → list does not blank the
 * grid behind a skeleton: the list shows what is held at once and revalidates behind it. A
 * write patches the one row it returned instead of refetching the whole collection.
 *
 * Subclasses are root services that say how to fetch the collection and key a row.
 */
export abstract class KeyedCollectionStore<T, K extends string | number> {
  private readonly rowsState = signal<readonly T[]>([]);
  private readonly loadedState = signal(false);
  private readonly failedState = signal(false);
  private readonly refreshingState = signal(false);
  private inFlight: Subscription | null = null;
  /**
   * Rows written while a refresh was in flight. That response was read before the write,
   * so without re-applying these it would put back the state the admin just changed.
   */
  private readonly writtenDuringRefresh = new Map<K, T>();

  readonly rows = this.rowsState.asReadonly();
  /** True once any load has succeeded. Until then there is nothing to show but a skeleton. */
  readonly loaded = this.loadedState.asReadonly();
  /** The last load failed. Only worth a full error state when nothing was loaded before it. */
  readonly failed = this.failedState.asReadonly();
  readonly refreshing = this.refreshingState.asReadonly();

  /** The whole collection. */
  protected abstract fetch(): Observable<T[]>;

  protected abstract keyOf(row: T): K;

  /** The order a newly created row is inserted in. The list screens sort for display anyway. */
  protected abstract compare(a: T, b: T): number;

  /** Fetches the collection. A call while one is already in flight joins it. */
  refresh(): void {
    if (this.inFlight && !this.inFlight.closed) {
      return;
    }
    this.refreshingState.set(true);
    this.failedState.set(false);
    this.writtenDuringRefresh.clear();

    this.inFlight = this.fetch().subscribe({
      next: (rows) => {
        const written = [...this.writtenDuringRefresh.values()];
        this.rowsState.set(rows);
        // Still inside the subscription, so these upserts record themselves again — hence
        // clearing afterwards rather than before.
        written.forEach((row) => this.upsert(row));
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

  /** Loads the collection only if nothing is held yet — for screens that merely consult it. */
  ensureLoaded(): void {
    if (!this.loadedState()) {
      this.refresh();
    }
  }

  byKey(key: K): T | undefined {
    return this.rowsState().find((row) => this.keyOf(row) === key);
  }

  /** Replaces the row a write returned, or inserts a new one in `compare` order. */
  upsert(row: T): void {
    const key = this.keyOf(row);
    if (this.inFlight && !this.inFlight.closed) {
      this.writtenDuringRefresh.set(key, row);
    }
    this.rowsState.update((rows) => {
      const index = rows.findIndex((existing) => this.keyOf(existing) === key);
      if (index >= 0) {
        const next = [...rows];
        next[index] = row;
        return next;
      }
      const insertAt = rows.findIndex((existing) => this.compare(existing, row) > 0);
      return insertAt < 0 ? [...rows, row] : [...rows.slice(0, insertAt), row, ...rows.slice(insertAt)];
    });
  }
}
