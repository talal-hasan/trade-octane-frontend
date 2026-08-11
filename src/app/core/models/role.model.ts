export type Role =
  | 'RSM'
  | 'RMC'
  | 'HEAD_OF_SALES'
  | 'ADMIN'
  | 'MIS'
  | 'TRADE_CATEGORY'
  | 'DISTRIBUTOR';

export const ALL_ROLES: Role[] = [
  'RSM',
  'RMC',
  'HEAD_OF_SALES',
  'ADMIN',
  'MIS',
  'TRADE_CATEGORY',
  'DISTRIBUTOR',
];

export const ROLE_LABELS: Record<Role, string> = {
  RSM: 'Regional Sales Manager',
  RMC: 'Regional Marketing Coordinator',
  HEAD_OF_SALES: 'Head of Sales',
  ADMIN: 'Admin',
  MIS: 'MIS',
  TRADE_CATEGORY: 'Trade Category',
  DISTRIBUTOR: 'Distributor',
};
