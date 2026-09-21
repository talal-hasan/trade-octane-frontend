import { FormControl } from '@angular/forms';

import { normaliseName, uniqueNameValidator } from './unique-name.validator';

describe('uniqueNameValidator', () => {
  const taken = new Map([['admin', 'ADMIN (role 13)']]);
  const validator = uniqueNameValidator((name) => taken.get(name) ?? null);

  it('matches ignoring case and surrounding spaces, as the server does', () => {
    expect(normaliseName('  Admin ')).toBe('admin');
    expect(new FormControl('  aDmIn ', validator).errors).toEqual({ nameTaken: { owner: 'ADMIN (role 13)' } });
  });

  it('passes a free name, and leaves an empty one to Validators.required', () => {
    expect(new FormControl('Key Account', validator).errors).toBeNull();
    expect(new FormControl('', validator).errors).toBeNull();
  });
});
