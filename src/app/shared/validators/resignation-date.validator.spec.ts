import { FormControl } from '@angular/forms';

import {
  RESIGNATION_MAX_FUTURE_DAYS,
  resignationDateProblem,
  resignationDateValidator,
  resignationMaxDate,
  toIsoDate,
} from './resignation-date.validator';

/** A fixed "today" so the future bound is testable without drifting with the clock. */
const TODAY = new Date(2026, 8, 20); // 20 September 2026, local.

describe('resignationDateProblem', () => {
  it('accepts an ordinary date inside the bounds', () => {
    expect(resignationDateProblem('2026-03-05', TODAY)).toBeNull();
    expect(resignationDateProblem('2000-01-01', TODAY)).toBeNull();
  });

  it('refuses anything that is not yyyy-MM-dd', () => {
    // The format the legacy screen used. Accepting it is exactly the bug this replaces.
    expect(resignationDateProblem('05-03-2026', TODAY)).toBe('malformed');
    expect(resignationDateProblem('2026-3-5', TODAY)).toBe('malformed');
    expect(resignationDateProblem('not a date', TODAY)).toBe('malformed');
  });

  it('refuses a date that only looks real', () => {
    // `new Date(2026, 1, 31)` silently becomes 3 March, so the parts must survive the trip.
    expect(resignationDateProblem('2026-02-31', TODAY)).toBe('malformed');
    expect(resignationDateProblem('2026-13-01', TODAY)).toBe('malformed');
  });

  it('applies the server bounds at both ends', () => {
    expect(resignationDateProblem('1999-12-31', TODAY)).toBe('tooEarly');

    const lastAllowed = new Date(TODAY);
    lastAllowed.setDate(lastAllowed.getDate() + RESIGNATION_MAX_FUTURE_DAYS);
    expect(resignationDateProblem(toIsoDate(lastAllowed), TODAY)).toBeNull();

    const dayAfter = new Date(lastAllowed);
    dayAfter.setDate(dayAfter.getDate() + 1);
    expect(resignationDateProblem(toIsoDate(dayAfter), TODAY)).toBe('tooLate');
  });

  it('allows a future date — notice periods and planned retirements are legitimate', () => {
    expect(resignationDateProblem('2026-12-31', TODAY)).toBeNull();
  });
});

describe('resignationDateValidator', () => {
  it('leaves an empty value alone', () => {
    expect(new FormControl('', resignationDateValidator(() => TODAY)).errors).toBeNull();
  });

  it('reports the reason rather than a bare true', () => {
    const control = new FormControl('1990-01-01', resignationDateValidator(() => TODAY));
    expect(control.errors).toEqual({ resignationDate: 'tooEarly' });
  });
});

describe('toIsoDate', () => {
  it('uses the local calendar, not UTC', () => {
    // 1 January at 00:30 in PKT is still 31 December in UTC — `toISOString()` would move
    // the day, which on this screen would silently record the wrong date.
    expect(toIsoDate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });
});

describe('resignationMaxDate', () => {
  it('is the last date the server will accept', () => {
    const expected = new Date(TODAY);
    expected.setDate(expected.getDate() + RESIGNATION_MAX_FUTURE_DAYS);
    expect(resignationMaxDate(TODAY)).toBe(toIsoDate(expected));
  });
});
