import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Marks a control required only when `condition` currently returns true. */
export function requiredIfValidator(condition: () => boolean): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    if (!condition()) {
      return null;
    }
    const value = control.value;
    const isEmpty = value === null || value === undefined || value === '';
    return isEmpty ? { requiredIf: true } : null;
  };
}
