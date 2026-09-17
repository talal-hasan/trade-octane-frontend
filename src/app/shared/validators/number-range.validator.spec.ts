import { FormControl, FormGroup } from '@angular/forms';

import { numberRangeValidator } from './number-range.validator';
import { uniqueCombinationValidator } from './unique-combination.validator';

function band(from: number | null, to: number | null): FormGroup {
  return new FormGroup(
    { from: new FormControl(from), to: new FormControl(to) },
    { validators: numberRangeValidator('from', 'to') },
  );
}

describe('numberRangeValidator', () => {
  it('allows equal ends, including 0 to 0', () => {
    expect(band(0, 0).errors).toBeNull();
    expect(band(5, 5).errors).toBeNull();
  });

  it('refuses a To below the From', () => {
    expect(band(10, 9).errors).toEqual({ numberRange: true });
  });

  it('waits until both are filled', () => {
    expect(band(10, null).errors).toBeNull();
  });
});

describe('uniqueCombinationValidator', () => {
  it('reports the record holding the combination', () => {
    const group = new FormGroup(
      { role: new FormControl(4) },
      { validators: uniqueCombinationValidator((g) => (g.get('role')?.value === 4 ? 'level 12' : null)) },
    );
    expect(group.errors).toEqual({ combinationTaken: 'level 12' });
    group.controls.role.setValue(5);
    expect(group.errors).toBeNull();
  });
});
