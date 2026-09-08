import { Signal, computed, signal } from '@angular/core';

import { ApiInt, CursorPage, int } from './api.types';

// ─────────────────────────────────────────────────────────────────────────────
// Keyset pagination, as the Administration grids actually work.
//
// The contract is explicit: "page N costs the same as page 1; a cursor is valid only for
// the filters, sort and direction it was issued under."
//
// Two consequences the UI has to respect, and which rule out the numbered paginator the
// rest of the app uses:
//
//   1. A cursor cannot be *computed*, only remembered. There is no cursor for "page 7"
//      until pages 1–6 have been fetched, so jumping to an arbitrary page is impossible.
//   2. Any filter or sort change invalidates every cursor held. Keeping them would page
//      into a result set that no longer exists.
//
// So the grids get Prev / Next over a remembered cursor stack, plus "showing X–Y of N"
// from `totalCount`, and `reset()` is called on every filter change. Offering numbered
// pages here would mean fetching every intermediate page to satisfy one click — the exact
// cost keyset pagination exists to avoid.
// ─────────────────────────────────────────────────────────────────────────────

export interface PagerState {
  pageIndex: number;
  pageSize: number;
  totalCount: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** 1-based index of the first row on this page; 0 when the page is empty. */
  rangeFrom: number;
  rangeTo: number;
}

export class CursorPager {
  /** Cursor for each page. `stack[0]` is always null — page 1 needs no cursor. */
  private readonly stack = signal<(string | null)[]>([null]);
  private readonly index = signal(0);
  private readonly total = signal(0);
  private readonly size = signal(0);
  private readonly nextCursor = signal<string | null>(null);
  private readonly rowsOnPage = signal(0);

  constructor(private readonly defaultPageSize = 25) {
    this.size.set(defaultPageSize);
  }

  /** The cursor to send with the next request. Null on the first page. */
  readonly cursor: Signal<string | null> = computed(() => this.stack()[this.index()] ?? null);
  readonly pageSize: Signal<number> = computed(() => this.size());

  readonly state: Signal<PagerState> = computed(() => {
    const pageIndex = this.index();
    const pageSize = this.size() || this.defaultPageSize;
    const rows = this.rowsOnPage();
    const rangeFrom = rows === 0 ? 0 : pageIndex * pageSize + 1;
    return {
      pageIndex,
      pageSize,
      totalCount: this.total(),
      hasPrevious: pageIndex > 0,
      hasNext: this.nextCursor() !== null,
      rangeFrom,
      rangeTo: rows === 0 ? 0 : rangeFrom + rows - 1,
    };
  });

  /** Records the page the server returned. Call after every successful fetch. */
  absorb(page: Pick<CursorPage<unknown>, 'nextCursor' | 'totalCount' | 'pageSize'> & { rowCount: number }): void {
    this.nextCursor.set(page.nextCursor ?? null);
    this.total.set(int(page.totalCount));
    const reported = int(page.pageSize);
    this.size.set(reported > 0 ? reported : this.defaultPageSize);
    this.rowsOnPage.set(page.rowCount);
  }

  /**
   * Advances, remembering the cursor that reaches the new page. Returns false when there
   * is no next page, so callers can skip a pointless request.
   */
  next(): boolean {
    const cursor = this.nextCursor();
    if (cursor === null) {
      return false;
    }
    const nextIndex = this.index() + 1;
    this.stack.update((stack) => {
      const copy = [...stack];
      copy[nextIndex] = cursor;
      // Anything beyond the page we are moving to was reached from a different sequence
      // and is no longer guaranteed valid.
      return copy.slice(0, nextIndex + 1);
    });
    this.index.set(nextIndex);
    return true;
  }

  previous(): boolean {
    if (this.index() === 0) {
      return false;
    }
    this.index.update((value) => value - 1);
    return true;
  }

  /** Call on every filter, search or sort change — held cursors are void. */
  reset(): void {
    this.stack.set([null]);
    this.index.set(0);
    this.nextCursor.set(null);
    this.rowsOnPage.set(0);
    this.total.set(0);
  }

  /**
   * Re-fetches the current page rather than returning to page 1. Used after a write —
   * activating a user should leave the admin where they were, not at the top of the list.
   */
  stay(): string | null {
    return this.cursor();
  }
}

/** Narrows a wire page to what the pager needs. */
export function pageMetrics<T>(page: CursorPage<T>): {
  nextCursor: string | null;
  totalCount: ApiInt;
  pageSize: ApiInt;
  rowCount: number;
} {
  return {
    nextCursor: page.nextCursor ?? null,
    totalCount: page.totalCount,
    pageSize: page.pageSize,
    rowCount: page.data?.length ?? 0,
  };
}
