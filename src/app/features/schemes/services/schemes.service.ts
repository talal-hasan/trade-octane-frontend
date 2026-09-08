import { Signal } from '@angular/core';
import { Observable } from 'rxjs';

import { Scheme, SchemeStatus } from '../models/scheme.model';

// Stateful schemes store (CLAUDE.md §3 mock-first). `schemes` is the reactive source of
// truth; lifecycle mutations update it so the status board (and any future scheme screens)
// react. Abstract class doubles as the DI token; the real HttpClient-backed service swaps
// in with no component changes.
export abstract class SchemesService {
  abstract readonly schemes: Signal<readonly Scheme[]>;

  /** Simulates an initial fetch so consumers can show a loading state. */
  abstract refresh(): Observable<readonly Scheme[]>;

  /** Pause / resume / expire — sets the lifecycle status and records an activity entry. */
  abstract setStatus(id: string, status: SchemeStatus): Observable<Scheme>;

  /** Scheme copier (§8): clones an existing scheme as a fresh Active scheme. */
  abstract duplicate(id: string): Observable<Scheme>;
}
