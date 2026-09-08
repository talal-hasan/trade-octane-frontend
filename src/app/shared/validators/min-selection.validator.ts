import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Requires at least `min` entries in an array-valued control — the multi-select
 * equivalent of `Validators.required`, which passes on `[]` because an empty array is
 * not an empty value.
 */
export function minSelectionValidator(min = 1): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value: unknown = control.value;
    const length = Array.isArray(value) ? value.length : 0;
    return length >= min ? null : { minSelection: { required: min, actual: length } };
  };
}
