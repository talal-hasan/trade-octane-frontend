import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { environment } from '../../../environments/environment';

// Gates routes that should only exist during POC/mock vetting (e.g. /style-guide).
export const MocksOnlyGuard: CanActivateFn = () => {
  if (environment.useMocks) {
    return true;
  }
  const router = inject(Router);
  return router.createUrlTree(['/dashboard']);
};
