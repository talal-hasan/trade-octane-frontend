import { Directive, TemplateRef, ViewContainerRef, effect, inject, input } from '@angular/core';

import { PermissionService } from '../../core/services/permission.service';

@Directive({
  selector: '[toHasPermission]',
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly permissionService = inject(PermissionService);

  readonly toHasPermission = input.required<string>();

  private hasView = false;

  constructor() {
    effect(() => {
      const allowed = this.permissionService.canAccess(this.toHasPermission());

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
