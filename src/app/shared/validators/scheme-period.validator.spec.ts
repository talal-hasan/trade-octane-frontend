import { FormControl, FormGroup } from '@angular/forms';

import { schemePeriodValidator } from './scheme-period.validator';

const TODAY = new Date(2026, 8, 24);

function period(from: Date | null, to: Date | null, today: Date | null = TODAY): FormGroup {
  return new FormGroup(
    { from: new FormControl<Date | null>(from), to: new FormControl<Date | null>(to) },
    { validators: schemePeriodValidator('from', 'to', () => today) },
  );
}

describe('schemePeriodValidator', () => {
  it('accepts today to the month end, and a single day', () => {
    expect(period(new Date(2026, 8, 24), new Date(2026, 8, 30)).errors).toBeNull();
    expect(period(new Date(2026, 9, 5), new Date(2026, 9, 5)).errors).toBeNull();
  });

  it('refuses a To Date before the From Date', () => {
    expect(period(new Date(2026, 9, 10), new Date(2026, 9, 9)).errors).toEqual({ periodOrder: true });
  });

  it('refuses a range across two months', () => {
    expect(period(new Date(2026, 8, 28), new Date(2026, 9, 2)).errors).toEqual({ periodMonths: true });
  });

  it('refuses a start before today, whatever the time of day', () => {
    const errors = period(new Date(2026, 8, 23, 23, 59), new Date(2026, 8, 30)).errors;
    expect(errors?.['periodPast']).toEqual({ today: TODAY });
    expect(period(new Date(2026, 8, 24, 0, 0), new Date(2026, 8, 30), new Date(2026, 8, 24, 18)).errors).toBeNull();
  });

  it('waits for both dates and for today', () => {
    expect(period(null, new Date(2026, 8, 30)).errors).toBeNull();
    expect(period(new Date(2020, 0, 1), new Date(2020, 0, 2), null).errors).toBeNull();
  });
});
