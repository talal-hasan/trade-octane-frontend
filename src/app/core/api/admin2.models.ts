// ─────────────────────────────────────────────────────────────────────────────
// Administration 2.0 contracts — the CPS_* screens, served from `/api/v1/admin2/...`.
//
// Kept apart from admin.models.ts on purpose. The 2.0 screens edit Promo_Management_2, a
// different user population with differently shaped tables, so a 2.0 type that happens
// to share a name with a 1.0 one ("role", "access control") is not the same thing and
// must not be importable as if it were.
//
// Wire integers are `ApiInt` and read through `int()`, as everywhere else — see
// api.types.ts for why.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiInt } from './api.types';

// ─── Create Distributor (MenuID 87, CPS_CreateDistributor.aspx) ─────────────

/** Which accounts `GET /admin2/distributors` returns. The server defaults to `Active`. */
export type DistributorStatusFilter = 'Active' | 'Inactive' | 'All';

/**
 * A distributor's sign-in account, without its password. Nothing on this API returns the
 * password — legacy decrypted it back into the Edit form.
 */
export interface DistributorAccountResponse {
  /** The master's distributor code. Also the sign-in name, and not editable. */
  distributorId: string;
  /** Taken from the distributor master at creation. Not editable. */
  name: string;
  contact: string;
  city: string;
  regionCode: string;
  /** Empty when the stored code no longer resolves to a region. */
  region: string;
  areaCode: string;
  area: string;
  territoryCode: string;
  /** Empty when the stored code no longer resolves to a territory. */
  territory: string;
  businessTypeId: ApiInt;
  businessType: string;
  distributorEmail: string;
  kpoEmail: string;
  /** The password sign-in admits only active distributors. */
  isActive: boolean;
  /** Set alongside `isActive = false` by Deactivate. Nothing at sign-in reads it. */
  isDeleted: boolean;
  /**
   * Honoured by the **SSO** sign-in only — the password sign-in's lock check is commented
   * out in the legacy procedure. Deactivating is what stops every sign-in.
   */
  isLocked: boolean;
  /** Set by the forgotten-password flow: they must update their profile at next sign-in. */
  passwordChangeRequired: boolean;
  createdAt: string | null;
  passwordSetAt: string | null;
}

/** A distributor in the master with no account yet — one choice in the Distributor picker. */
export interface DistributorCandidateResponse {
  distributorId: string;
  name: string;
  /** The master's own region text, for orientation. Not a location code. */
  region: string;
  /**
   * The master's resignation date, as stored. Placeholder years (2030, 2050) mean "still
   * working"; a past date means the distributor resigned. Legacy offered every row.
   */
  resignationDate: string | null;
}

export interface DistributorBusinessTypeResponse {
  businessTypeId: ApiInt;
  name: string;
}

export interface DistributorTerritoryResponse {
  code: string;
  name: string;
}

export interface DistributorAreaResponse {
  code: string;
  name: string;
  territories: DistributorTerritoryResponse[];
}

export interface DistributorRegionResponse {
  code: string;
  name: string;
  areas: DistributorAreaResponse[];
}

/** The form's pickers in one call: business types, and active regions → areas → territories. */
export interface DistributorAccountCatalogueResponse {
  businessTypes: DistributorBusinessTypeResponse[];
  regions: DistributorRegionResponse[];
}

/** `POST /admin2/distributors`. Every member is required. */
export interface CreateDistributorRequest {
  distributorId: string;
  businessTypeId: number;
  regionCode: string;
  areaCode: string;
  territoryCode: string;
  city: string;
  contact: string;
  password: string;
  distributorEmail: string;
  kpoEmail: string;
}

/**
 * `PUT /admin2/distributors/{distributorId}`. Every member except `password` is required;
 * omit `password` to keep the current one.
 */
export type UpdateDistributorRequest = Omit<CreateDistributorRequest, 'distributorId' | 'password'> & {
  password?: string;
};

/**
 * What a write changed, and the account afterwards. An empty `changedFields` means the
 * server wrote and logged nothing — the account was already in that state.
 */
export interface DistributorAccountWriteResponse {
  distributor: DistributorAccountResponse;
  changedFields: string[];
}
