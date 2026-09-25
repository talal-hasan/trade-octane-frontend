import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export interface YearMonth {
  year: number;
  month: number;
}

/**
 * Group validator: fails when the `yearKey` / `monthKey` pair falls outside the window
 * `window()` currently returns — `{ periodBefore: { earliest } }` or `{ periodAfter: { latest } }`.
 *
 * The window is read on every run, so it can follow another field (Create Budget's earliest
 * month depends on the scheme type). Call `updateValueAndValidity()` on the group when that
 * field changes. Passes while the year or month is unset, or the window is unknown — leave
 * those to `required`.
 */
export function periodWindowValidator(
  yearKey: string,
  monthKey: string,
  window: () => { earliest: YearMonth; latest: YearMonth } | null,
): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const year = group.get(yearKey)?.value as unknown;
    const month = group.get(monthKey)?.value as unknown;
    const bounds = window();
    if (typeof year !== 'number' || typeof month !== 'number' || year <= 0 || month < 1 || month > 12 || !bounds) {
      return null;
    }
    const index = year * 12 + month;
    if (index < bounds.earliest.year * 12 + bounds.earliest.month) {
      return { periodBefore: { earliest: bounds.earliest } };
    }
    if (index > bounds.latest.year * 12 + bounds.latest.month) {
      return { periodAfter: { latest: bounds.latest } };
    }
    return null;
  };
}
