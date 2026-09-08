// Primitives shared by every Trade Octane API contract.
//
// The OpenAPI document declares its integer fields as `"type": ["integer", "string"]`
// with a `^-?(?:0|[1-9]\d*)$` pattern — the backend may serialise an int as either a JSON
// number or a JSON string, and `DashboardTilesResponse` returns *every* count as a string.
// Typing these as `number` would compile and then fail at runtime the first time the
// server sends `"42"`: `menuId === 42` is false, `Set<number>.has("42")` is false, and a
// permission check that silently returns false is the worst possible failure mode here.
//
// So the wire type is honest (`ApiInt`) and every read goes through `int()`.
export type ApiInt = number | string;

/** Coerces a wire integer to a real number. Returns `fallback` for null/blank/NaN. */
export function int(value: ApiInt | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Coerces a list of wire integers. Non-numeric entries are dropped, not silently zeroed. */
export function intList(values: readonly ApiInt[] | null | undefined): number[] {
  if (!values) {
    return [];
  }
  const out: number[] = [];
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) {
      out.push(parsed);
    }
  }
  return out;
}

/** Coerces a list of wire integers straight into a Set, for membership tests. */
export function intSet(values: readonly ApiInt[] | null | undefined): ReadonlySet<number> {
  return new Set(intList(values));
}

// ─── Cursor pagination ────────────────────────────────────────────────────────
// Every Administration grid is keyset-paginated: "page N costs the same as page 1; a
// cursor is valid only for the filters, sort and direction it was issued under."
//
// That last clause is the constraint that shapes the UI. A cursor cannot be recomputed,
// only remembered, and it is invalidated by any filter change — so the grids offer
// Prev / Next over a remembered cursor stack rather than numbered page jumps. See
// CursorPager.
export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  totalCount: ApiInt;
  pageSize: ApiInt;
  snapshotVersion: ApiInt;
}

// ─── Response envelopes ───────────────────────────────────────────────────────
// The deployment wraps some single-object responses in `{ "data": ... }` where the
// OpenAPI document declares the object directly. `login_old` is the one that bit us:
// the contract declares LoginResponse's fields at the top level, but the server returns
// `{ "data": { "accessToken": "...", ... } }`, so reading `response.accessToken` yielded
// undefined, no Authorization header was attached, and every subsequent call 401'd —
// surfacing on the login form as "username and password did not match".
//
// The contract *does* declare envelopes for some endpoints (CurrentUserWrapperResponse,
// UserWrapperResponse, UserLookupWrapperResponse), so the wrapping is real but applied
// inconsistently. Rather than guess per endpoint, unwrap defensively.

/**
 * Unwraps a `{ data: T }` envelope, if that is what this is.
 *
 * **The single-key test is the whole safety of this.** Several real payloads have a `data`
 * property that is *not* an envelope — `UserPageResponse` is
 * `{ data: [...], nextCursor, totalCount, pageSize, snapshotVersion }`, and blindly
 * unwrapping it would silently discard the pagination cursor and the total. So a body is
 * only treated as an envelope when `data` is its **sole** property, which no paged
 * response ever satisfies.
 *
 * Safe to apply to a body that is already unwrapped: it passes straight through.
 *
 * One caveat on the *type*: given `T | { data: T }`, TypeScript resolves `T` to the
 * envelope reading whenever the argument has a `data` property, so calling this on a paged
 * response would infer the row array even though the runtime correctly returns the page.
 * That mismatch never bites in practice because call sites annotate the union explicitly
 * (`get<AccountResponse | { data: AccountResponse }>`) and paged endpoints do not call this
 * at all — but do not "simplify" a paged call through here.
 */
export function unwrapData<T>(body: T | { data: T }): T {
  if (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'data' in body &&
    Object.keys(body).length === 1
  ) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** RFC 7807 error body returned by every non-2xx response. */
export interface ProblemDetails {
  type?: string | null;
  title?: string | null;
  status?: number | null;
  detail?: string | null;
  instance?: string | null;
}
