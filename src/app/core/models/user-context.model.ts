import { Role } from './role.model';

export interface UserContext {
  userId: string;
  name: string;
  roles: Role[];
  regions: string[];
  brands: string[];
  permissions: string[]; // e.g. ['BUDGET_VIEW', 'BUDGET_APPROVE', 'SCHEME_CREATE']
}
