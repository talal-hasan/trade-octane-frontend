import { Injectable, signal } from '@angular/core';
import { Observable, delay, map, of, throwError } from 'rxjs';

import {
  AdminUser,
  DirectoryPerson,
  DistributorRecord,
  NewUserInput,
  UserStatus,
} from '../models/admin-user.model';
import { AdminUsersService } from './admin-users.service';

/** Directory search ignores anything shorter than this, as a real AD lookup would. */
const MIN_QUERY = 2;

const DIRECTORY: DirectoryPerson[] = [
  {
    employeeId: 'FC-10241',
    name: 'Ahmed Bilal',
    email: 'ahmed.bilal@frieslandcampina.com',
    department: 'Sales Operations',
    designation: 'Regional Sales Manager',
    region: 'Punjab-North',
  },
  {
    employeeId: 'FC-10388',
    name: 'Sara Iqbal',
    email: 'sara.iqbal@frieslandcampina.com',
    department: 'Trade Marketing',
    designation: 'Regional Marketing Coordinator',
    region: 'Punjab-North',
  },
  {
    employeeId: 'FC-10455',
    name: 'Bilal Ahmad Khan',
    email: 'bilal.khan@frieslandcampina.com',
    department: 'Sales Operations',
    designation: 'Area Sales Manager',
    region: 'Sindh',
  },
  {
    employeeId: 'FC-10502',
    name: 'Hina Raza',
    email: 'hina.raza@frieslandcampina.com',
    department: 'Trade Category',
    designation: 'Trade Category Manager',
    region: 'Punjab-South',
  },
  {
    employeeId: 'FC-10577',
    name: 'Kamran Yousuf',
    email: 'kamran.yousuf@frieslandcampina.com',
    department: 'MIS',
    designation: 'MIS Analyst',
    region: 'Sindh',
  },
  {
    employeeId: 'FC-10613',
    name: 'Farhan Malik',
    email: 'farhan.malik@frieslandcampina.com',
    department: 'Sales Leadership',
    designation: 'Head of Sales',
    region: 'Punjab-North',
  },
  {
    employeeId: 'FC-10690',
    name: 'Ayesha Noor',
    email: 'ayesha.noor@frieslandcampina.com',
    department: 'Channel Development',
    designation: 'Channel Development Manager',
    region: 'KPK',
  },
  {
    employeeId: 'FC-10704',
    name: 'Usman Tariq',
    email: 'usman.tariq@frieslandcampina.com',
    department: 'Route to Market',
    designation: 'RTM Executive',
    region: 'Punjab-South',
  },
];

const DISTRIBUTORS: DistributorRecord[] = [
  { code: 'D-4401', name: 'Waqas Distribution Co.', businessType: 'Dairy (GT)', region: 'Punjab-North' },
  { code: 'D-4418', name: 'Al-Madina Traders', businessType: 'Dairy (GT)', region: 'Punjab-South' },
  { code: 'D-4502', name: 'Sindh Dairy Supplies', businessType: 'Dairy (GT)', region: 'Sindh' },
  { code: 'D-4610', name: 'Frontier FSD Services', businessType: 'FSD', region: 'KPK' },
  { code: 'D-4655', name: 'Imtiaz Super Stores', businessType: 'Modern Trade', region: 'Sindh' },
  { code: 'D-4702', name: 'Quetta Cold Chain', businessType: 'Dairy (GT)', region: 'Balochistan' },
];

const SEED_USERS: AdminUser[] = [
  {
    id: 'u-rsm-01',
    name: 'Ahmed Bilal',
    email: 'ahmed.bilal@frieslandcampina.com',
    userType: 'ad',
    status: 'active',
    roles: ['RSM'],
    permissions: [
      'BUDGET_VIEW',
      'BUDGET_CREATE',
      'SCHEME_VIEW',
      'SCHEME_CREATE',
      'CLAIMS_VIEW',
      'CLAIMS_APPROVE',
      'DISTRIBUTION_VIEW',
      'REPORTS_VIEW',
    ],
    regions: ['Punjab-North', 'Punjab-South'],
    brands: ['Olpers', 'Tarang'],
    lastActive: '2026-08-18T07:40:00.000Z',
    createdAt: '2025-11-02T09:00:00.000Z',
  },
  {
    id: 'u-hos-01',
    name: 'Farhan Malik',
    email: 'farhan.malik@frieslandcampina.com',
    userType: 'ad',
    status: 'active',
    roles: ['HEAD_OF_SALES'],
    permissions: [
      'BUDGET_VIEW',
      'BUDGET_APPROVE',
      'SCHEME_VIEW',
      'SCHEME_APPROVE',
      'CLAIMS_VIEW',
      'CLAIMS_APPROVE',
      'DISTRIBUTION_VIEW',
      'REPORTS_VIEW',
    ],
    regions: ['Punjab-North', 'Punjab-South', 'Sindh', 'KPK'],
    brands: ['Olpers', 'Tarang', 'Nurpur'],
    lastActive: '2026-08-18T06:12:00.000Z',
    createdAt: '2025-09-14T09:00:00.000Z',
  },
  {
    id: 'u-tc-01',
    name: 'Hina Raza',
    email: 'hina.raza@frieslandcampina.com',
    userType: 'ad',
    status: 'active',
    roles: ['TRADE_CATEGORY'],
    permissions: ['BUDGET_VIEW', 'SCHEME_VIEW', 'SCHEME_CREATE', 'SCHEME_APPROVE', 'REPORTS_VIEW'],
    regions: ['Punjab-North', 'Punjab-South'],
    brands: ['Olpers', 'Tarang'],
    lastActive: '2026-08-17T14:03:00.000Z',
    createdAt: '2026-01-20T09:00:00.000Z',
  },
  {
    id: 'u-mis-01',
    name: 'Kamran Yousuf',
    email: 'kamran.yousuf@frieslandcampina.com',
    userType: 'ad',
    status: 'active',
    roles: ['MIS'],
    permissions: ['BUDGET_VIEW', 'SCHEME_VIEW', 'CLAIMS_VIEW', 'DISTRIBUTION_VIEW', 'REPORTS_VIEW'],
    regions: ['Punjab-North', 'Punjab-South', 'Sindh', 'KPK', 'Balochistan'],
    brands: ['Olpers', 'Tarang', 'Nurpur'],
    lastActive: '2026-08-18T05:55:00.000Z',
    createdAt: '2025-10-08T09:00:00.000Z',
  },
  {
    id: 'u-dist-01',
    name: 'Waqas Distribution Co.',
    email: 'kpo.waqas@distributor.pk',
    userType: 'distributor',
    status: 'active',
    roles: ['DISTRIBUTOR'],
    permissions: ['CLAIMS_VIEW', 'DISTRIBUTION_VIEW'],
    regions: ['Punjab-North'],
    brands: ['Olpers'],
    distributorCode: 'D-4401',
    city: 'Lahore',
    lastActive: '2026-08-16T11:20:00.000Z',
    createdAt: '2026-02-11T09:00:00.000Z',
  },
  {
    id: 'u-dist-02',
    name: 'Sindh Dairy Supplies',
    email: 'kpo.sindhdairy@distributor.pk',
    userType: 'distributor',
    status: 'disabled',
    roles: ['DISTRIBUTOR'],
    permissions: ['CLAIMS_VIEW', 'DISTRIBUTION_VIEW'],
    regions: ['Sindh'],
    brands: ['Olpers', 'Tarang'],
    distributorCode: 'D-4502',
    city: 'Karachi',
    lastActive: '2026-06-30T08:10:00.000Z',
    createdAt: '2025-12-05T09:00:00.000Z',
  },
  {
    id: 'u-tmp-01',
    name: 'ASM_FSD_Lahore_FCBL',
    email: 'asm.fsd.lahore@frieslandcampina.com',
    userType: 'temporary',
    status: 'active',
    roles: ['RSM'],
    permissions: ['BUDGET_VIEW', 'SCHEME_VIEW', 'CLAIMS_VIEW', 'CLAIMS_APPROVE', 'REPORTS_VIEW'],
    regions: ['Punjab-North'],
    brands: ['Olpers'],
    endDate: '2026-09-30',
    lastActive: '2026-08-15T13:45:00.000Z',
    createdAt: '2026-07-01T09:00:00.000Z',
  },
  {
    id: 'u-admin-01',
    name: 'Nida Sheikh',
    email: 'nida.sheikh@frieslandcampina.com',
    userType: 'ad',
    status: 'active',
    roles: ['ADMIN'],
    permissions: [
      'BUDGET_VIEW',
      'BUDGET_CREATE',
      'BUDGET_APPROVE',
      'SCHEME_VIEW',
      'SCHEME_CREATE',
      'SCHEME_APPROVE',
      'CLAIMS_VIEW',
      'CLAIMS_APPROVE',
      'DISTRIBUTION_VIEW',
      'DISTRIBUTION_MANAGE',
      'REPORTS_VIEW',
      'ADMIN_USER_MANAGE',
      'ADMIN_MASTER_DATA',
    ],
    regions: ['Punjab-North', 'Punjab-South', 'Sindh', 'KPK', 'Balochistan'],
    brands: ['Olpers', 'Tarang', 'Nurpur'],
    lastActive: '2026-08-18T08:30:00.000Z',
    createdAt: '2025-08-01T09:00:00.000Z',
  },
];

@Injectable()
export class MockAdminUsersService extends AdminUsersService {
  private readonly store = signal<readonly AdminUser[]>(SEED_USERS);
  readonly users = this.store.asReadonly();

  private sequence = SEED_USERS.length;

  refresh(): Observable<readonly AdminUser[]> {
    return of(this.store()).pipe(delay(240));
  }

  searchDirectory(query: string): Observable<DirectoryPerson[]> {
    const term = query.trim().toLowerCase();
    if (term.length < MIN_QUERY) {
      return of([]);
    }
    // Already-provisioned people are excluded rather than shown-and-rejected, so the
    // admin can't pick someone who would fail on submit.
    const taken = new Set(this.store().map((user) => user.email.toLowerCase()));
    return of(
      DIRECTORY.filter(
        (person) =>
          !taken.has(person.email.toLowerCase()) &&
          (person.name.toLowerCase().includes(term) ||
            person.email.toLowerCase().includes(term) ||
            person.employeeId.toLowerCase().includes(term)),
      ),
    ).pipe(delay(200));
  }

  searchDistributors(query: string): Observable<DistributorRecord[]> {
    const term = query.trim().toLowerCase();
    return of(
      DISTRIBUTORS.filter(
        (distributor) =>
          term.length < MIN_QUERY ||
          distributor.name.toLowerCase().includes(term) ||
          distributor.code.toLowerCase().includes(term),
      ),
    ).pipe(delay(200));
  }

  create(input: NewUserInput): Observable<AdminUser> {
    const duplicate = this.store().some(
      (user) => user.email.toLowerCase() === input.email.trim().toLowerCase(),
    );
    if (duplicate) {
      return throwError(() => new Error('A user with that email already exists.')).pipe(delay(300));
    }

    this.sequence += 1;
    const user: AdminUser = {
      id: `u-new-${this.sequence}`,
      name: input.name.trim(),
      email: input.email.trim(),
      userType: input.userType,
      // AD users land active because the directory has already vouched for them. The two
      // DB-credentialled types land pending until their first sign-in sets a password.
      status: input.userType === 'ad' ? 'active' : 'pending',
      roles: [...input.roles],
      permissions: [...input.permissions],
      regions: [...input.regions],
      brands: [...input.brands],
      endDate: input.endDate,
      distributorCode: input.distributorCode,
      city: input.city,
      createdAt: new Date().toISOString(),
    };

    return of(user).pipe(
      delay(420),
      map((created) => {
        this.store.update((users) => [created, ...users]);
        return created;
      }),
    );
  }

  setStatus(id: string, status: UserStatus): Observable<AdminUser> {
    const target = this.store().find((user) => user.id === id);
    if (!target) {
      return throwError(() => new Error('User not found.'));
    }
    const updated: AdminUser = { ...target, status };
    return of(updated).pipe(
      delay(280),
      map((next) => {
        this.store.update((users) => users.map((user) => (user.id === id ? next : user)));
        return next;
      }),
    );
  }
}
