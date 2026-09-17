import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

// The legacy password rule, as the API enforces it (`CreateUserCommandValidator.IsPasswordStrong`
// plus the "must not contain the user id" check). Mirrored here so the form can show each
// rule turning green as it is met, rather than a 400 after the click. The server stays
// authoritative — this only saves the round trip.

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 20;

/** The server's special-character set, verbatim. A character outside it does not count. */
const SPECIAL_CHARACTERS = new Set("!@#$%^&*()_+}{:;'?/\\><.,");

export interface PasswordRuleCheck {
  key: 'length' | 'upper' | 'lower' | 'digit' | 'special' | 'spaces' | 'id';
  label: string;
  met: boolean;
}

/**
 * Each rule and whether `password` meets it, in display order. `forbiddenId` adds the
 * "does not contain the id" rule, compared case-insensitively as the server does.
 */
export function passwordRuleChecks(password: string, forbiddenId = ''): PasswordRuleCheck[] {
  let hasDigit = false;
  let hasUpper = false;
  let hasLower = false;
  let hasSpecial = false;
  let hasWhitespace = false;

  for (const character of password) {
    if (/\s/.test(character)) {
      hasWhitespace = true;
    }
    if (character >= '0' && character <= '9') {
      hasDigit = true;
    } else if (character >= 'A' && character <= 'Z') {
      hasUpper = true;
    } else if (character >= 'a' && character <= 'z') {
      hasLower = true;
    }
    if (SPECIAL_CHARACTERS.has(character)) {
      hasSpecial = true;
    }
  }

  const checks: PasswordRuleCheck[] = [
    {
      key: 'length',
      label: `${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    },
    { key: 'upper', label: 'An upper-case letter', met: hasUpper },
    { key: 'lower', label: 'A lower-case letter', met: hasLower },
    { key: 'digit', label: 'A number', met: hasDigit },
    { key: 'special', label: 'A special character, e.g. ! @ # $ %', met: hasSpecial },
    { key: 'spaces', label: 'No spaces', met: password.length > 0 && !hasWhitespace },
  ];

  const id = forbiddenId.trim();
  if (id) {
    checks.push({
      key: 'id',
      label: 'Does not contain the distributor ID',
      met: password.length > 0 && !password.toLowerCase().includes(id.toLowerCase()),
    });
  }

  return checks;
}

/**
 * Fails with `{ passwordRules: true }` when any rule is unmet. An empty value passes, so
 * the same validator serves a required password (pair it with `Validators.required`) and
 * an optional one ("leave blank to keep the current password").
 *
 * `forbiddenId` is read on every run, so it tracks a distributor picked after the password
 * was typed — re-run it with `updateValueAndValidity()` when that id changes.
 */
export function legacyPasswordValidator(forbiddenId: () => string = () => ''): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = typeof control.value === 'string' ? control.value : '';
    if (!value) {
      return null;
    }
    return passwordRuleChecks(value, forbiddenId()).every((check) => check.met)
      ? null
      : { passwordRules: true };
  };
}
