import { HttpErrorResponse } from '@angular/common/http';

import { messageFor, serverDetail } from './error.interceptor';

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
