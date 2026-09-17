import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Group validator: fails with `{ numberRange: true }` when the `toKey` control holds a
 * number below the `fromKey` control's. Passes while either is empty — leave that to
 * `Validators.required` on the controls.
 */
export function numberRangeValidator(fromKey: string, toKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const from = group.get(fromKey)?.value as unknown;
    const to = group.get(toKey)?.value as unknown;
    if (typeof from !== 'number' || typeof to !== 'number') {
      return null;
    }
    return to < from ? { numberRange: true } : null;
  };
}
