import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * The bounds `AdministrationResignationCommandHandler` enforces, mirrored so a typo is
 * caught before a round trip rather than after one.
 *
 * They are deliberately loose at the far end: notice periods, planned retirements and
 * fixed-term contracts are all legitimate reasons to record a date well ahead, and a
 * tighter bound would only push administrators back to the Web Forms screen. Keep these in
 * step with `MinYear` / `MaxFutureDays` on the server if either moves.
 */
export const RESIGNATION_MIN_YEAR = 2000;
export const RESIGNATION_MAX_FUTURE_DAYS = 730;

export type ResignationDateProblem = 'malformed' | 'tooEarly' | 'tooLate';

/**
 * Validates a `yyyy-MM-dd` resignation date. Fails with
 * `{ resignationDate: <ResignationDateProblem> }`.
 *
 * An empty value passes — pair with `Validators.required`, or leave it empty to mean "no
 * change". Note that the *only* accepted shape is ISO: this screen exists because the
 * legacy one accepted `dd-MM-yyyy` free text and let SQL Server decide which half was the
 * day, so there is no lenient parse here on purpose.
 *
 * `today` is injectable for tests; it defaults to the local date, which is the right frame
 * — an administrator recording "today" means their today, not UTC's.
 */
export function resignationDateValidator(today: () => Date = () => new Date()): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const raw = typeof control.value === 'string' ? control.value.trim() : '';
    if (!raw) {
      return null;
    }

    const problem = resignationDateProblem(raw, today());
    return problem ? { resignationDate: problem } : null;
  };
}

/** The reason a date is unacceptable, or null when it is fine. */
export function resignationDateProblem(
  value: string,
  today: Date = new Date(),
): ResignationDateProblem | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return 'malformed';
  }

  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  // Rejects 31 February and friends: the Date constructor rolls them over rather than
  // failing, so the only reliable check is that the parts survived the round trip.
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() !== Number(month) - 1 ||
    parsed.getDate() !== Number(day)
  ) {
    return 'malformed';
  }

  if (parsed.getFullYear() < RESIGNATION_MIN_YEAR) {
    return 'tooEarly';
  }

  const latest = startOfDay(today);
  latest.setDate(latest.getDate() + RESIGNATION_MAX_FUTURE_DAYS);

  return parsed > latest ? 'tooLate' : null;
}

/** `yyyy-MM-dd` in the **local** calendar — `toISOString()` would shift the day in PKT. */
export function toIsoDate(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

/** The latest date the server will accept, as `yyyy-MM-dd`, for an input's `max`. */
export function resignationMaxDate(today: Date = new Date()): string {
  const latest = startOfDay(today);
  latest.setDate(latest.getDate() + RESIGNATION_MAX_FUTURE_DAYS);
  return toIsoDate(latest);
}

/** The earliest date the server will accept, as `yyyy-MM-dd`, for an input's `min`. */
export function resignationMinDate(): string {
  return `${RESIGNATION_MIN_YEAR}-01-01`;
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
