import { FormControl } from '@angular/forms';

import { legacyPasswordValidator, passwordRuleChecks } from './legacy-password.validator';

function unmet(password: string, id = ''): string[] {
  return passwordRuleChecks(password, id)
    .filter((check) => !check.met)
    .map((check) => check.key);
}

describe('passwordRuleChecks', () => {
  it('accepts a password meeting every server rule', () => {
    expect(unmet('Octane#2026', '700001')).toEqual([]);
  });

  it('names each rule a password misses', () => {
    expect(unmet('short')).toEqual(['length', 'upper', 'digit', 'special']);
    expect(unmet('Octane 2026#')).toEqual(['spaces']);
    expect(unmet('Octane#2026Octane#2026')).toEqual(['length']);
  });

  it('counts only the server’s special characters', () => {
    // "-" and "~" are not in the legacy set.
    expect(unmet('Octane-2026~')).toEqual(['special']);
  });

  it('refuses the distributor id inside the password, ignoring case', () => {
    expect(unmet('Dist#AB12cd', 'ab12CD')).toEqual(['id']);
  });

  it('adds the id rule only when there is an id', () => {
    expect(passwordRuleChecks('x').some((check) => check.key === 'id')).toBe(false);
  });
});

describe('legacyPasswordValidator', () => {
  it('lets an empty value through, so an edit can keep the current password', () => {
    expect(new FormControl('', legacyPasswordValidator()).errors).toBeNull();
  });

  it('fails a weak password and follows the id it is given', () => {
    let id = '';
    const control = new FormControl('Store#700001x', legacyPasswordValidator(() => id));
    expect(control.errors).toBeNull();

    id = '700001';
    control.updateValueAndValidity();
    expect(control.errors).toEqual({ passwordRules: true });
  });
});
