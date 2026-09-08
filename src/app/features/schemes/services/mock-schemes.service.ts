import { Injectable, inject, signal } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';

import { PermissionService } from '../../../core/services/permission.service';
import type { ActivityEntry } from '../../../shared/components/activity-timeline/activity-timeline.component';
import { Scheme, SchemeStatus, SchemeType } from '../models/scheme.model';
import { SchemesService } from './schemes.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

function daysAhead(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString();
}

interface SeedInput {
  id: string;
  name: string;
  type: SchemeType;
  region: string;
  brand: string;
  discountPercent: number;
  redemptionPercent: number;
  expiryInDays: number;
  status: SchemeStatus;
  createdDaysAgo: number;
}

function seed(input: SeedInput): Scheme {
  const activity: ActivityEntry[] = [
    { actor: 'Hina Raza', action: 'created the scheme', timestamp: daysAgo(input.createdDaysAgo) },
    { actor: 'Farhan Malik', action: 'activated the scheme', timestamp: daysAgo(input.createdDaysAgo - 1) },
  ];
  if (input.status === 'paused') {
    activity.push({ actor: 'Farhan Malik', action: 'paused the scheme', timestamp: daysAgo(2) });
  } else if (input.status === 'expired') {
    activity.push({ actor: 'Farhan Malik', action: 'expired the scheme', timestamp: daysAgo(1) });
  }
  return {
    id: input.id,
    name: input.name,
    type: input.type,
    region: input.region,
    brand: input.brand,
    discountPercent: input.discountPercent,
    redemptionPercent: input.redemptionPercent,
    expiryDate: daysAhead(input.expiryInDays),
    status: input.status,
    activity,
  };
}

const MOCK_SCHEMES: Scheme[] = [
  seed({ id: 'BRD-0042', name: 'Ramadan retailer discount', type: 'brd', region: 'Punjab-North', brand: 'Olpers', discountPercent: 5, redemptionPercent: 80, expiryInDays: 45, status: 'active', createdDaysAgo: 30 }),
  seed({ id: 'TO-0113', name: 'Festive bundle offer', type: 'trade-offer', region: 'Punjab-South', brand: 'Tarang', discountPercent: 8, redemptionPercent: 62, expiryInDays: 60, status: 'active', createdDaysAgo: 22 }),
  seed({ id: 'BRD-0051', name: 'Winter volume push', type: 'brd', region: 'Sindh', brand: 'Nurpur', discountPercent: 4, redemptionPercent: 35, expiryInDays: 20, status: 'paused', createdDaysAgo: 40 }),
  seed({ id: 'TO-0120', name: 'Modern trade activation', type: 'trade-offer', region: 'KPK', brand: 'Olpers', discountPercent: 6, redemptionPercent: 95, expiryInDays: 12, status: 'active', createdDaysAgo: 18 }),
  seed({ id: 'BRD-0039', name: 'Q2 wholesale slab', type: 'brd', region: 'Balochistan', brand: 'Tarang', discountPercent: 7, redemptionPercent: 100, expiryInDays: -5, status: 'expired', createdDaysAgo: 120 }),
  seed({ id: 'TO-0108', name: 'Eid gift-with-purchase', type: 'trade-offer', region: 'Punjab-North', brand: 'Nurpur', discountPercent: 10, redemptionPercent: 48, expiryInDays: 30, status: 'active', createdDaysAgo: 26 }),
];

function statusVerb(status: SchemeStatus): string {
  switch (status) {
    case 'active':
      return 'resumed the scheme';
    case 'paused':
      return 'paused the scheme';
    case 'expired':
      return 'expired the scheme';
  }
}

// Pure transform: sets a new lifecycle status and appends an activity entry.
function applyStatus(scheme: Scheme, status: SchemeStatus, actor: string, now: Date): Scheme {
  return {
    ...scheme,
    status,
    activity: [
      ...scheme.activity,
      { actor, action: statusVerb(status), timestamp: now.toISOString() },
    ],
  };
}

// Pure transform: clones a scheme as a fresh Active scheme with zeroed redemption.
function duplicateScheme(scheme: Scheme, newId: string, actor: string, now: Date): Scheme {
  const ts = now.toISOString();
  return {
    ...scheme,
    id: newId,
    name: `${scheme.name} (copy)`,
    redemptionPercent: 0,
    status: 'active',
    activity: [{ actor, action: `created as a copy of ${scheme.id}`, timestamp: ts }],
  };
}

@Injectable()
export class MockSchemesService extends SchemesService {
  private readonly permissionService = inject(PermissionService);

  private readonly schemesSignal = signal<Scheme[]>(MOCK_SCHEMES);
  readonly schemes = this.schemesSignal.asReadonly();

  // Sequence for cloned scheme ids, kept clear of the seed set.
  private sequence = 300;

  refresh(): Observable<readonly Scheme[]> {
    return of(this.schemesSignal()).pipe(delay(500));
  }

  setStatus(id: string, status: SchemeStatus): Observable<Scheme> {
    return of(null).pipe(
      delay(700),
      map(() =>
        this.mutate(id, (scheme, actor) => applyStatus(scheme, status, actor, new Date())),
      ),
    );
  }

  duplicate(id: string): Observable<Scheme> {
    return of(null).pipe(
      delay(700),
      map(() =>
        this.mutate(
          id,
          (scheme, actor) => {
            const prefix = scheme.type === 'brd' ? 'BRD' : 'TO';
            const newId = `${prefix}-${String(++this.sequence).padStart(4, '0')}`;
            return duplicateScheme(scheme, newId, actor, new Date());
          },
          true,
        ),
      ),
    );
  }

  // Applies a transform to the scheme with the given id. `prepend` adds a new record to the
  // top of the store (duplicate); otherwise the existing record is replaced in place.
  private mutate(
    id: string,
    transform: (scheme: Scheme, actor: string) => Scheme,
    prepend = false,
  ): Scheme {
    const current = this.schemesSignal().find((scheme) => scheme.id === id);
    if (!current) {
      throw new Error(`Scheme ${id} not found`);
    }
    const actor = this.permissionService.context().name || 'You';
    const result = transform(current, actor);
    if (prepend) {
      this.schemesSignal.update((schemes) => [result, ...schemes]);
    } else {
      this.schemesSignal.update((schemes) =>
        schemes.map((scheme) => (scheme.id === id ? result : scheme)),
      );
    }
    return result;
  }
}
