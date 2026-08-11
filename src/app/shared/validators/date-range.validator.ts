import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Applied to a FormGroup with `startControlName`/`endControlName` date controls. */
export function dateRangeValidator(startControlName: string, endControlName: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const start = group.get(startControlName)?.value;
    const end = group.get(endControlName)?.value;

    if (!start || !end) {
      return null;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    return endDate < startDate ? { dateRange: true } : null;
  };
}
