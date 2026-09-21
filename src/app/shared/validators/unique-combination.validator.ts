import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Group validator for a set of fields that together must be unique — a business type, claim
 * nature and role, say. Fails with `{ combinationTaken: owner }` when `ownerOf` finds another
 * record holding the group's current combination; the caller excludes the record being
 * edited. `ownerOf` is read on every run, so re-run with `updateValueAndValidity()` when the
 * records it consults change.
 *
 * A pre-check to spare the round trip; the server's own check stays authoritative.
 */
export function uniqueCombinationValidator<T>(ownerOf: (group: AbstractControl) => T | null): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const owner = ownerOf(group);
    return owner === null ? null : { combinationTaken: owner };
  };
}
