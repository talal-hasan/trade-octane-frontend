import { FormControl, FormGroup } from '@angular/forms';

import { periodWindowValidator } from './period-window.validator';

const WINDOW = { earliest: { year: 2026, month: 9 }, latest: { year: 2028, month: 12 } };

function period(year: number | null, month: number | null, window: typeof WINDOW | null = WINDOW): FormGroup {
  return new FormGroup(
    { year: new FormControl(year), month: new FormControl(month) },
    { validators: periodWindowValidator('year', 'month', () => window) },
  );
}

describe('periodWindowValidator', () => {
  it('accepts both ends of the window', () => {
    expect(period(2026, 9).errors).toBeNull();
    expect(period(2028, 12).errors).toBeNull();
  });

  it('names the earliest month when the period is before it', () => {
    expect(period(2026, 8).errors).toEqual({ periodBefore: { earliest: { year: 2026, month: 9 } } });
  });

  it('names the latest month when the period is after it', () => {
    expect(period(2029, 1).errors).toEqual({ periodAfter: { latest: { year: 2028, month: 12 } } });
  });

  it('waits for a year, a month and a window', () => {
    expect(period(2026, null).errors).toBeNull();
    expect(period(2020, 1, null).errors).toBeNull();
  });
});
