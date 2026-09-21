import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const SEGMENT = /^[A-Za-z0-9_.-]+$/;
const TLD = /^[A-Za-z]{2,5}$/;

/**
 * The legacy email rule, as the API enforces it (`CreateUserCommandValidator.IsEmailWellFormed`):
 * `^([a-zA-Z0-9_\-\.]+)@([a-zA-Z0-9_\-\.]+)\.([a-zA-Z]{2,5})$`.
 *
 * Stricter than Angular's `Validators.email`, which accepts addresses the server refuses
 * (a ten-letter TLD, a `+` in the local part). Matching the server exactly is what stops a
 * form that looks valid from failing on submit.
 */
export function isLegacyEmail(value: string): boolean {
  const at = value.indexOf('@');
  if (at <= 0 || at === value.length - 1 || value.indexOf('@', at + 1) >= 0) {
    return false;
  }
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const lastDot = domain.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === domain.length - 1) {
    return false;
  }
  return SEGMENT.test(local) && SEGMENT.test(domain.slice(0, lastDot)) && TLD.test(domain.slice(lastDot + 1));
}

/** Fails with `{ legacyEmail: true }`. An empty value passes — pair with `Validators.required`. */
export function legacyEmailValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value.trim() : '';
    return !value || isLegacyEmail(value) ? null : { legacyEmail: true };
  };
}
