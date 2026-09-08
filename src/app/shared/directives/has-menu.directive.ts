import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { MenuAccessService } from '../../core/services/menu-access.service';

/**
 * Shows content only when the user holds at least one of the given legacy menu rows.
 *
 * Replaces `*toHasPermission`, which tested an invented permission string. Takes menu ids
 * because that is what the server authorises on — and takes a *list* because a control is
 * usually justified by any one of several grants:
 *
 *   <button *toHasMenu="[136]">Assign role</button>
 *   <button *toHasMenu="[19, 142]">Edit access</button>
 *
 * Prefer referencing the named constants in menu-blueprint.ts over inlining bare numbers
 * where the call site is not self-evident.
 */
@Directive({
  selector: '[toHasMenu]',
})
export class HasMenuDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly menuAccess = inject(MenuAccessService);

  readonly toHasMenu = input.required<number | readonly number[]>();

  private hasView = false;

  constructor() {
    effect(() => {
      const value = this.toHasMenu();
      const menuIds = typeof value === 'number' ? [value] : value;
      const allowed = this.menuAccess.hasAnyMenu(menuIds);

      if (allowed && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
      } else if (!allowed && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }
}
