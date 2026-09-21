import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const CONTACT = /^[0-9+]+$/;

/**
 * Digits and `+` only — the legacy validator's `^([0-9\+]+)$`, which the API still applies.
 * Fails with `{ contactNumber: true }`. An empty value passes — pair with `Validators.required`.
 */
export function contactNumberValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    return !value || CONTACT.test(value) ? null : { contactNumber: true };
  };
}
