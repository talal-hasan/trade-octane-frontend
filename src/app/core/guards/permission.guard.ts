import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { PermissionService } from '../services/permission.service';

// Checks route.data.requiredPermission before activation — never flash a screen
// then redirect (CLAUDE.md §4).
export const PermissionGuard: CanActivateFn = (route) => {
  const permissionService = inject(PermissionService);
  const router = inject(Router);

  const requiredPermission = route.data['requiredPermission'] as string | undefined;

  if (!permissionService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (!requiredPermission || permissionService.canAccess(requiredPermission)) {
    return true;
  }

  return router.createUrlTree(['/access-denied']);
};
