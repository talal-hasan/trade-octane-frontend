import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Group validator for a scheme's From / To dates, the rules legacy's CheckControls applied
 * ("Please select Correct Date Duration"): the To Date not before the From Date, both in one
 * month, and the From Date not before `today()`.
 *
 * Fails with the first that applies — `{ periodOrder }`, `{ periodMonths }` or
 * `{ periodPast: { today } }`. Passes while either date is empty (leave that to
 * `Validators.required`) and while `today()` is null, i.e. not loaded yet.
 */
export function schemePeriodValidator(fromKey: string, toKey: string, today: () => Date | null): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const from = group.get(fromKey)?.value as unknown;
    const to = group.get(toKey)?.value as unknown;
    if (!(from instanceof Date) || !(to instanceof Date)) {
      return null;
    }
    if (dayOf(to) < dayOf(from)) {
      return { periodOrder: true };
    }
    if (from.getFullYear() !== to.getFullYear() || from.getMonth() !== to.getMonth()) {
      return { periodMonths: true };
    }
    const now = today();
    if (now && dayOf(from) < dayOf(now)) {
      return { periodPast: { today: now } };
    }
    return null;
  };
}

/** Days since the epoch, in local time — so a time of day never tips the comparison. */
function dayOf(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}
