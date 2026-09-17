import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** How names are compared for uniqueness: surrounding spaces and case do not count. */
export function normaliseName(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Fails with `{ nameTaken: { owner } }` when another record already holds the name.
 *
 * `ownerOf` receives the normalised name and returns a description of the record holding it
 * ("role 13, ADMIN"), or null when it is free. The caller excludes the record being edited,
 * so re-saving a record under its own name passes. Read on every run, so it tracks a
 * catalogue that finishes loading after the name was typed — re-run it then with
 * `updateValueAndValidity()`. An empty value passes; pair with `Validators.required`.
 *
 * This is a pre-check that saves the round trip. The server's unique check stays
 * authoritative, since someone else can take the name between the check and the save.
 */
export function uniqueNameValidator(ownerOf: (normalised: string) => string | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? normaliseName(control.value) : '';
    if (!value) {
      return null;
    }
    const owner = ownerOf(value);
    return owner ? { nameTaken: { owner } } : null;
  };
}
