import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Fails with `{ notAnOption: true }` when the control holds a value that is not among the
 * options `allowed()` currently returns — a picker whose value was set from elsewhere (a
 * template, a remembered choice) and is no longer on offer.
 *
 * Passes while the value is empty (leave that to `required`) or the options are still loading
 * (`allowed()` returns null). Re-run it with `updateValueAndValidity()` when the options load.
 */
export function oneOfValidator<T extends string | number>(allowed: () => ReadonlySet<T> | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value as T | null | undefined;
    const options = allowed();
    if (value === null || value === undefined || value === '' || value === 0 || !options) {
      return null;
    }
    return options.has(value) ? null : { notAnOption: true };
  };
}
