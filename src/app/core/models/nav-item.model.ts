export interface NavItem {
  label: string;
  icon: string; // Tabler icon name, e.g. 'layout-dashboard'
  route: string;
  requiredPermission?: string;
  badgeKey?: 'claims' | 'approvals'; // pending-count badges (CLAUDE.md §6)
}

export interface NavSection {
  label?: string;
  items: NavItem[];
}

// Static definition of every possible nav destination. What renders per-user is
// filtered dynamically by PermissionService in SidebarComponent — never hardcoded
// per role (CLAUDE.md §4 Screen-Level Access).
export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      // Dashboard = read-only overview landing page. Workspace = the approvals desk where
      // the work actually happens. They sit together at the top because they are the two
      // screens a user starts their day on.
      { label: 'Dashboard', icon: 'layout-dashboard', route: '/dashboard' },
      {
        label: 'My Workspace',
        icon: 'inbox',
        route: '/workspace',
        badgeKey: 'approvals',
      },
    ],
  },
  {
    label: 'Trade Marketing',
    items: [
      { label: 'Budgets', icon: 'wallet', route: '/budget', requiredPermission: 'BUDGET_VIEW' },
      {
        label: 'Schemes',
        icon: 'discount-2',
        route: '/schemes',
        requiredPermission: 'SCHEME_VIEW',
      },
      {
        label: 'Claims',
        icon: 'file-invoice',
        route: '/claims',
        requiredPermission: 'CLAIMS_VIEW',
        badgeKey: 'claims',
      },
      {
        label: 'Distribution',
        icon: 'truck-delivery',
        route: '/distribution',
        requiredPermission: 'DISTRIBUTION_VIEW',
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', icon: 'chart-bar', route: '/reports', requiredPermission: 'REPORTS_VIEW' },
    ],
  },
  {
    label: 'Admin',
    items: [
      {
        label: 'User Access',
        icon: 'users-group',
        route: '/admin/user-management',
        requiredPermission: 'ADMIN_USER_MANAGE',
      },
      {
        label: 'Master Data',
        icon: 'database-cog',
        route: '/admin/master-data',
        requiredPermission: 'ADMIN_MASTER_DATA',
      },
    ],
  },
];
