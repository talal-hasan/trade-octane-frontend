import {
  HttpClient,
  HttpContext,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { NotificationService } from '../services/notification.service';
import {
  errorInterceptor,
  isRefusal,
  messageFor,
  refusalsAsInfo,
  serverDetail,
} from './error.interceptor';

function httpError(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body });
}

describe('serverDetail', () => {
  // The shape the API actually returns. The old code read `.message`, which is in none of
  // these, so every server explanation was thrown away.
  it('prefers RFC 7807 detail over title', () => {
    expect(
      serverDetail({ title: 'Bad Request', detail: 'Role 4 is retired and cannot be assigned.' }),
    ).toBe('Role 4 is retired and cannot be assigned.');
  });

  it('falls back to title when there is no detail', () => {
    expect(serverDetail({ title: 'Conflict', status: 409 })).toBe('Conflict');
  });

  it('flattens an ASP.NET validation errors dictionary', () => {
    expect(
      serverDetail({
        title: 'One or more validation errors occurred.',
        errors: { Email: ['Email is invalid.'], Password: ['Too short.'] },
      }),
    ).toBe('Email is invalid.\nToo short.');
  });

  it('accepts a bare string body', () => {
    expect(serverDetail('Delivery is locked in SAP.')).toBe('Delivery is locked in SAP.');
  });

  // IIS answers a 404 with a full HTML document. Rendering that in a toast is worse than
  // saying nothing, which is exactly what we hit while finding the API base path.
  it('rejects an HTML error page', () => {
    expect(serverDetail('<!DOCTYPE html><html><head><title>404</title>')).toBeNull();
  });

  it('returns null for a Blob, which cannot be read synchronously', () => {
    expect(serverDetail(new Blob(['{"detail":"nope"}']))).toBeNull();
  });

  it('returns null for empty or unusable bodies', () => {
    expect(serverDetail(null)).toBeNull();
    expect(serverDetail('')).toBeNull();
    expect(serverDetail({})).toBeNull();
    expect(serverDetail(42)).toBeNull();
  });
});

describe('messageFor', () => {
  it('shows the server explanation rather than a generic message', () => {
    expect(messageFor(httpError(400, { detail: 'Expected 312 rows, found 309.' }))).toBe(
      'Expected 312 rows, found 309.',
    );
  });

  // The case that motivated this: a 500 with a real explanation used to render as
  // "Something went wrong on our end", discarding the one useful sentence.
  it('shows a server explanation even on a 500', () => {
    expect(messageFor(httpError(500, { detail: 'Timeout contacting SAP after 30s.' }))).toBe(
      'Timeout contacting SAP after 30s.',
    );
  });

  it('falls back to our own wording when the body says nothing', () => {
    expect(messageFor(httpError(500, null))).toContain('500');
    expect(messageFor(httpError(403, null))).toContain('permission');
    expect(messageFor(httpError(404, null))).toContain('not found');
    expect(messageFor(httpError(409, null))).toContain('conflicted');
  });

  // These two never carry a useful body, so our wording wins even if one is present.
  it('always uses our wording for a network failure and an expired session', () => {
    expect(messageFor(httpError(0, { detail: 'ignored' }))).toContain('reach the server');
    expect(messageFor(httpError(401, { detail: 'Unauthorized' }))).toContain('session has expired');
  });

  it('names the status when nothing else is known', () => {
    expect(messageFor(httpError(418, null))).toContain('418');
  });
});

describe('isRefusal', () => {
  // 403 included: Integration answers it for a release that is switched off.
  it('counts a 4xx the server deliberately declined as a refusal', () => {
    for (const status of [400, 403, 404, 409, 422, 429]) {
      expect(isRefusal(httpError(status, null))).toBe(true);
    }
  });

  // None of these is the server declining a choice, so they stay errors wherever refusals
  // are softened.
  it('does not count an expired session, a server fault or a lost connection', () => {
    for (const status of [0, 401, 500, 503]) {
      expect(isRefusal(httpError(status, null))).toBe(false);
    }
  });
});

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  const notices: { severity: 'error' | 'info'; detail: string }[] = [];

  beforeEach(() => {
    notices.length = 0;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        {
          provide: NotificationService,
          useValue: {
            error: (detail: string) => notices.push({ severity: 'error', detail }),
            info: (detail: string) => notices.push({ severity: 'info', detail }),
          },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  function fail(context: HttpContext | undefined, status: number, detail: string): void {
    http.get('/scope', { context }).subscribe({ error: () => undefined });
    backend.expectOne('/scope').flush({ detail }, { status, statusText: 'x' });
  }

  it('reports a failure as an error by default', () => {
    fail(undefined, 400, "'month' must be between 1 and 12.");
    expect(notices).toEqual([{ severity: 'error', detail: "'month' must be between 1 and 12." }]);
  });

  // The Ownership filters: the server saying "not yet" while someone is still choosing.
  it('reports a refusal as information when the request opts in', () => {
    fail(refusalsAsInfo(), 400, "'month' must be between 1 and 12.");
    expect(notices).toEqual([{ severity: 'info', detail: "'month' must be between 1 and 12." }]);
  });

  // Integration's switched-off release.
  it('reports a 403 refusal as information when the request opts in', () => {
    fail(refusalsAsInfo(), 403, 'Auto-DA release is disabled. Dry runs are unaffected.');
    expect(notices).toEqual([
      { severity: 'info', detail: 'Auto-DA release is disabled. Dry runs are unaffected.' },
    ]);
  });

  it('still reports a server fault or an expired session as an error when the request opts in', () => {
    fail(refusalsAsInfo(), 500, 'Timeout.');
    fail(refusalsAsInfo(), 401, 'Unauthorized');
    expect(notices.map((notice) => notice.severity)).toEqual(['error', 'error']);
  });
});
