import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** Query values the API accepts. Arrays are repeated (`?product=A&product=B`). */
export type QueryValue = string | number | boolean | null | undefined | readonly string[] | readonly number[];
export type Query = Record<string, QueryValue>;

/**
 * Builds HttpParams, dropping anything the API should treat as "not supplied".
 *
 * The distinction matters: `status=''` is not the same request as omitting `status`, and
 * several Administration endpoints treat an empty string as a filter that matches nothing.
 * Only `null`, `undefined` and `''` are dropped — `false` and `0` are real values and are
 * sent.
 */
export function toHttpParams(query: Query | undefined): HttpParams {
  let params = new HttpParams();
  if (!query) {
    return params;
  }
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        params = params.append(key, String(entry));
      }
      continue;
    }
    params = params.set(key, String(value));
  }
  return params;
}

/**
 * Thin transport for the Trade Octane API. Adds the version prefix and nothing else —
 * auth headers, error toasts and the loading indicator are already interceptors
 * (CLAUDE.md §3), and duplicating any of that here would double-handle it.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);

  /**
   * `environment.apiBase` empty means same-origin, which is what the dev proxy gives us.
   * [PENDING — Zeeshan, CLAUDE.md §14 item 5] the test-environment base URL.
   */
  private readonly base = `${environment.apiBase.replace(/\/+$/, '')}/api/v1`;

  url(path: string): string {
    return `${this.base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toHttpParams(query) });
  }

  post<T>(path: string, body?: unknown, query?: Query): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? null, { params: toHttpParams(query) });
  }

  put<T>(path: string, body?: unknown, query?: Query): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? null, { params: toHttpParams(query) });
  }

  delete<T>(path: string, query?: Query): Observable<T> {
    return this.http.delete<T>(this.url(path), { params: toHttpParams(query) });
  }

  /**
   * CSV endpoints. Every Administration grid has an `/export` sibling that returns the
   * *filtered* set — so an export must be issued with the same query the grid is showing,
   * never with a bare request that silently exports everything.
   */
  downloadCsv(path: string, query?: Query): Observable<Blob> {
    return this.http.get(this.url(path), {
      params: toHttpParams(query),
      responseType: 'blob',
    });
  }
}

/** Hands a downloaded blob to the browser. Kept here so every export behaves identically. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking synchronously can cancel the download in some browsers; defer a tick.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `users-2026-09-07.csv` — dated so repeated exports don't overwrite each other. */
export function csvFilename(prefix: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${today}.csv`;
}
