import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

// Native confirm() keeps this guard dependency-free (no UI component coupling at
// the core layer). Revisit if product wants a branded confirm dialog here instead.
export const UnsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return confirm('You have unsaved changes. Leave without saving?');
};
