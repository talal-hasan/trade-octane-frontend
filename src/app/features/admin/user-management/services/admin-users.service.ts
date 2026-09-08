import { Signal } from '@angular/core';
import { Observable } from 'rxjs';

import {
  AdminUser,
  DirectoryPerson,
  DistributorRecord,
  NewUserInput,
  UserStatus,
} from '../models/admin-user.model';

// Stateful admin-users store (CLAUDE.md §3 mock-first). `users` is the reactive source of
// truth, so provisioning a user on the form updates the list with no refetch. Abstract
// class doubles as the DI token; the HttpClient-backed implementation swaps in with no
// component changes.
export abstract class AdminUsersService {
  abstract readonly users: Signal<readonly AdminUser[]>;

  /** Primes the store so consumers can show a loading state. */
  abstract refresh(): Observable<readonly AdminUser[]>;

  /**
   * Active Directory lookup. Company users are never typed in by hand — the admin
   * searches the directory and picks a person, and identity fields fill themselves
   * (KT Meeting 2 §1: "users sourced from Active Directory, auto-populate on AD creation").
   * Returns [] for queries shorter than the minimum length rather than the whole directory.
   */
  abstract searchDirectory(query: string): Observable<DirectoryPerson[]>;

  /** Distributor master list, sourced from SAP via BAPI in the real system. */
  abstract searchDistributors(query: string): Observable<DistributorRecord[]>;

  abstract create(input: NewUserInput): Observable<AdminUser>;

  abstract setStatus(id: string, status: UserStatus): Observable<AdminUser>;
}
