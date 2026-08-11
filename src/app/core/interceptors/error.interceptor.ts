import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '../services/notification.service';

function messageFor(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'Unable to reach the server. Check your connection.';
  }
  if (error.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }
  if (error.status === 403) {
    return "You don't have permission to do that.";
  }
  if (error.status >= 500) {
    return 'Something went wrong on our end. Please try again.';
  }
  return error.error?.message ?? 'Something went wrong. Please try again.';
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        notificationService.error(messageFor(error));
      }
      return throwError(() => error);
    }),
  );
};
