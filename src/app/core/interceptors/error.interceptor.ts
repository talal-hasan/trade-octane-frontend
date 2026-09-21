import {
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';

import { NotificationService } from '../services/notification.service';

/**
 * How a failed request is reported. `'error'`, the default, is the red error toast.
 *
 * `'info'` is for requests whose refusals are guidance rather than failure. The Ownership
 * filters query the server on every click and are refused until a month, a scheme type and
 * a region are all picked ("'month' must be between 1 and 12"); Integration refuses a start
 * while a run is in progress, for a month that has not begun, or when releases are switched
 * off. Each is the server saying "not like that" or "not now", not "something broke", so it
 * is shown as information. Only refusals are softened — see `isRefusal`. A server fault, a
 * lost connection or an expired session is an error either way.
 */
export type FailureNotice = 'error' | 'info' | 'silent';
export const FAILURE_NOTICE = new HttpContextToken<FailureNotice>(() => 'error');

/**
 * A request context that reports refusals as information. Fresh per call: `HttpContext` is
 * mutable, so one shared instance could be changed under every request that used it.
 */
export function refusalsAsInfo(): HttpContext {
  return new HttpContext().set(FAILURE_NOTICE, 'info');
}

/**
 * A request context for callers that show refusals themselves, in place.
 *
 * Re-Route moves several queues one request at a time and reports each outcome on its own
 * line; a toast per refused queue would stack up over the very lines that explain them. As
 * with `'info'`, only refusals are affected — a server fault or an expired session is still
 * an error toast.
 */
export function refusalsSilent(): HttpContext {
  return new HttpContext().set(FAILURE_NOTICE, 'silent');
}

/**
 * A 4xx: the server deliberately declined the request — invalid or incomplete input, not
 * found, a conflict, a rate limit, or 403. Integration answers 403 for a release that is
 * switched off ("Dry runs are unaffected"), which is information, and so is a permission the
 * admin lacks. Not 401: an expired session means signing in again, whatever was clicked.
 */
export function isRefusal(error: HttpErrorResponse): boolean {
  return error.status >= 400 && error.status < 500 && error.status !== 401;
}

/**
 * Pulls the server's own explanation out of an error body.
 *
 * The API answers failures with RFC 7807 problem details — `{ type, title, status, detail,
 * instance }` — and may add ASP.NET's `errors` dictionary for validation failures. The
 * previous version read `error.error.message`, a field that **never appears** in any of
 * those shapes, so every failure fell through to "Something went wrong. Please try again."
 * The server was explaining itself and we were discarding it.
 *
 * Returns null when there is genuinely nothing to show, so the caller can fall back rather
 * than print an empty toast.
 */
export function serverDetail(body: unknown): string | null {
  if (!body) {
    return null;
  }

  // Some endpoints answer with a bare string.
  if (typeof body === 'string') {
    const trimmed = body.trim();
    // An HTML error page is not a message. IIS returns a full document for a 404, and
    // showing its markup in a toast is worse than saying nothing.
    if (!trimmed || trimmed.startsWith('<')) {
      return null;
    }
    return trimmed;
  }

  // A failed CSV download arrives as a Blob, which cannot be read synchronously here.
  if (body instanceof Blob) {
    return null;
  }

  if (typeof body !== 'object') {
    return null;
  }

  const problem = body as Record<string, unknown>;

  // Validation failures carry the useful text in `errors`, keyed by field. Flattened, one
  // per line, because "Email is invalid" is far more actionable than "Bad request".
  const errors = problem['errors'];
  if (errors && typeof errors === 'object') {
    const messages = Object.values(errors as Record<string, unknown>)
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (messages.length > 0) {
      return messages.join('\n');
    }
  }

  // `detail` is the specific explanation; `title` is the generic category. Prefer the
  // specific one, and only use `title` when it says more than the status code already does.
  for (const key of ['detail', 'title', 'message', 'error']) {
    const value = problem[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

/**
 * What to show the user for a failed request.
 *
 * The rule: **the server's own words win wherever it gave any**, because it knows what
 * actually went wrong and we do not. Our text is a fallback for the cases where the body
 * is empty, unreadable, or an IIS error page.
 *
 * The two exceptions are status 0 and 401, where the body is never useful — there is no
 * body at all for a network failure, and "Unauthorized" tells the user nothing about what
 * to do next.
 */
export function messageFor(error: HttpErrorResponse): string {
  if (error.status === 0) {
    return 'Unable to reach the server. Check your connection.';
  }
  if (error.status === 401) {
    return 'Your session has expired. Please sign in again.';
  }

  const detail = serverDetail(error.error);
  if (detail) {
    return detail;
  }

  if (error.status === 403) {
    return 'You do not have permission to do that.';
  }
  if (error.status === 404) {
    return 'That was not found. It may have been removed.';
  }
  if (error.status === 409) {
    return 'That conflicted with a change someone else made. Reload and try again.';
  }
  if (error.status >= 500) {
    return `The server errored (${error.status}). This is not something you did.`;
  }
  return `The request failed (${error.status}).`;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notificationService = inject(NotificationService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse) {
        const notice = req.context.get(FAILURE_NOTICE);
        if (notice === 'silent' && isRefusal(error)) {
          // The caller reports it in place — see `refusalsSilent`.
        } else if (notice === 'info' && isRefusal(error)) {
          notificationService.info(messageFor(error));
        } else {
          notificationService.error(messageFor(error));
        }
      }
      return throwError(() => error);
    }),
  );
};
