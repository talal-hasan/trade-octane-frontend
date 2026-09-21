import { FormControl } from '@angular/forms';

import { contactNumberValidator } from './contact-number.validator';
import { isLegacyEmail, legacyEmailValidator } from './legacy-email.validator';

describe('isLegacyEmail', () => {
  it('accepts what the legacy pattern accepts', () => {
    expect(isLegacyEmail('kpo.ops_1@frieslandcampina.com')).toBe(true);
    expect(isLegacyEmail('a-b@mail.co.pk')).toBe(true);
  });

  it('refuses what the server refuses, even where Validators.email would not', () => {
    expect(isLegacyEmail('name+tag@example.com')).toBe(false);
    expect(isLegacyEmail('name@example.technology')).toBe(false);
    expect(isLegacyEmail('name@localhost')).toBe(false);
    expect(isLegacyEmail('a@b@example.com')).toBe(false);
    expect(isLegacyEmail('@example.com')).toBe(false);
  });
});

describe('legacyEmailValidator', () => {
  it('leaves an empty value to Validators.required', () => {
    expect(new FormControl('', legacyEmailValidator()).errors).toBeNull();
  });

  it('checks the trimmed value', () => {
    expect(new FormControl('  ops@example.com ', legacyEmailValidator()).errors).toBeNull();
    expect(new FormControl('ops@', legacyEmailValidator()).errors).toEqual({ legacyEmail: true });
  });
});

describe('contactNumberValidator', () => {
  it('allows digits and +, nothing else', () => {
    expect(new FormControl('+923001234567', contactNumberValidator()).errors).toBeNull();
    expect(new FormControl('0300-1234567', contactNumberValidator()).errors).toEqual({ contactNumber: true });
    expect(new FormControl('0300 1234567', contactNumberValidator()).errors).toEqual({ contactNumber: true });
  });
});
