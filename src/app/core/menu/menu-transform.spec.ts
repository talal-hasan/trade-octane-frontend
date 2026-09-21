import { MenuItemResponse } from '../api/identity.models';
import {
  transformMenu,
  withAdminOnlyRoutes,
  withAdminOnlySidebarEntries,
  tablerIconFor,
} from './menu-transform';

// Fixture drawn from a real `GET /identity/menu` response (user t_SufyaM01, role Admin).
// Trimmed to the structures the fold has to get right, keeping the real menuIds:
//
//   • the Administration subtree — seven rows that must become one tabbed screen
//   • a module whose children are unmapped ("FSD Bulk Schemes")  → children fold into it
//   • the duplicate name case ("Perfect Store" as both menuId 76 and 85)
//   • a root that is unknown to the blueprint entirely           → must still render
//
// The full payload is at public/assets/response_menu.json.
function node(
  menuId: number,
  name: string,
  children: MenuItemResponse[] = [],
  icon: string | null = null,
): MenuItemResponse {
  return { menuId, name, icon, catalog: '1', children, hasChildren: children.length > 0 };
}

const ADMINISTRATION = node(
  4,
  'Administration 1.0',
  [
    node(17, 'Create User'),
    node(136, 'Assign Role to User', [], 'clipboard'),
    node(42, 'User Region Mapping'),
    node(41, 'User Brand Mapping'),
    node(142, 'Access Control | By Role'),
    node(19, 'Access Control'),
    node(22, 'Re-Route Scheme'),
    node(133, 'Employee Resignation'),
    node(20, 'Change User Details'),
    node(18, 'Edit Password'),
  ],
  'cogs',
);

const FSD = node(
  196,
  'FSD Bulk Schemes',
  [node(202, 'BRD Schemes'), node(217, 'TO Schemes'), node(209, 'Budget Report')],
  'money',
);

// Administration 2.0 as the local Promo_Management.dbo.MenuItems holds it (catalog "2").
const ADMINISTRATION_2 = node(
  92,
  'Administration 2.0',
  [
    node(87, 'Create Distributor'),
    node(93, 'Distributor Access'),
    node(88, 'Create Role'),
    node(89, 'Level Of Authorities'),
    node(90, 'Approval Hierarchy'),
    node(91, 'User Mapping'),
    node(97, 'Access Control'),
    node(154, 'Access Control | By Role'),
    node(230, 'Activity Logs'),
  ],
  'cogs',
);

const DASHBOARD = node(65, 'Dashboard', [node(85, 'Perfect Store')], 'tachometer');
const PERFECT_STORE = node(76, 'Perfect Store', [node(119, 'PS Portal Report')], 'shopping-cart');

function findItem(
  sections: ReturnType<typeof transformMenu>['sections'],
  route: string,
): { label: string; tabs: string[]; menuIds: number[]; pending: boolean } | undefined {
  for (const section of sections) {
    const match = section.items.find((item) => item.route === route);
    if (match) {
      return match;
    }
  }
  return undefined;
}

describe('transformMenu', () => {
  it('folds the seven Administration user rows into one tabbed Users screen', () => {
    const result = transformMenu([ADMINISTRATION]);
    const users = findItem(result.sections, '/admin/users');

    expect(users).toBeDefined();
    expect(users?.label).toBe('Users');
    // Create User, Assign Role, Region, Brand, Access Control, Resignation, Change Details
    expect(users?.menuIds.sort((a, b) => a - b)).toEqual([17, 19, 20, 41, 42, 133, 136]);
    expect(users?.tabs.sort()).toEqual(
      ['access', 'brands', 'profile', 'regions', 'resignation', 'roles'].sort(),
    );
  });

  it('gives a user granted only one facet that screen with only that tab', () => {
    const result = transformMenu([node(4, 'Administration 1.0', [node(41, 'User Brand Mapping')])]);
    const users = findItem(result.sections, '/admin/users');

    expect(users?.menuIds).toEqual([41]);
    expect(users?.tabs).toEqual(['brands']);
  });

  it('drops the grouping parent whose children are all mapped', () => {
    const result = transformMenu([ADMINISTRATION]);
    // menuId 4 is "Administration 1.0" — a header, not a destination.
    expect(findItem(result.sections, '/legacy/4')).toBeUndefined();
    expect(result.grantedMenuIds.has(4)).toBe(true);
  });

  it('folds unmapped children into their mapped parent instead of promoting them', () => {
    const result = transformMenu([FSD]);
    const fsd = findItem(result.sections, '/legacy/196');

    expect(fsd?.menuIds.sort((a, b) => a - b)).toEqual([196, 202, 209, 217]);
    expect(findItem(result.sections, '/legacy/202')).toBeUndefined();
    // Folded children stay findable in the command palette.
    const aliases = result.sections.flatMap((s) => s.items).find((i) => i.route === '/legacy/196');
    expect(aliases?.aliases).toContain('BRD Schemes');
  });

  it('never drops a row the blueprint does not know', () => {
    const unknown = node(9001, 'Some New Module', [node(9002, 'Its Screen')]);
    const result = transformMenu([unknown]);

    expect(result.unmapped.map((row) => row.menuId)).toEqual([9001]);
    const item = findItem(result.sections, '/legacy/9001');
    expect(item).toBeDefined();
    expect(item?.pending).toBe(true);
    expect(result.grantedMenuIds.has(9002)).toBe(true);
  });

  it('does not let a duplicate name steal another row’s blueprint entry', () => {
    // "Perfect Store" is menuId 76 (a module) and menuId 85 (a Dashboard screen). Row 85
    // must not name-match the blueprint entry for 76 while 76 is present in the payload.
    const result = transformMenu([DASHBOARD, PERFECT_STORE]);

    expect(result.nearMisses).toEqual([]);
    expect(findItem(result.sections, '/legacy/65')?.menuIds).toContain(85);
    expect(findItem(result.sections, '/legacy/76')?.menuIds).not.toContain(85);
  });

  it('keeps "Edit Password" out of the sidebar but inside the granted set', () => {
    const result = transformMenu([ADMINISTRATION]);
    // It routes to /account, which belongs in the avatar menu, so it has no nav group.
    expect(findItem(result.sections, '/account')).toBeUndefined();
    expect(result.grantedMenuIds.has(18)).toBe(true);
  });

  it('marks a destination as ported once any contributing row is ported', () => {
    const result = transformMenu([ADMINISTRATION, FSD]);

    // Users folds seven rows, and one ported contributor is enough for the destination —
    // which is what this asserts. It held while "Employee Resignation" (133) was still
    // unported, and holds now that it is built.
    expect(findItem(result.sections, '/admin/users')?.pending).toBe(false);

    // A module with no ported row anywhere stays pending and routes to the placeholder.
    expect(findItem(result.sections, '/legacy/196')?.pending).toBe(true);
  });

  it('gives Administration 2.0 its own group, one destination per built screen', () => {
    const result = transformMenu([ADMINISTRATION_2]);
    const section = result.sections.find((candidate) => candidate.label === 'Administration 2.0');

    // Every row this user holds is now ported, so nothing folds into /legacy/92 and the
    // group keeps the legacy menu's own order.
    expect(section?.items.map((item) => item.route)).toEqual([
      '/admin2/distributors',
      '/admin2/distributor-access',
      '/admin2/roles',
      '/admin2/level-of-authorities',
      '/admin2/claim-hierarchy',
      '/admin2/user-mapping',
      '/admin2/activity-logs',
    ]);
    expect(findItem(result.sections, '/admin2/distributor-access')?.pending).toBe(false);
    expect(findItem(result.sections, '/legacy/92')).toBeUndefined();
    expect(findItem(result.sections, '/admin2/distributors')?.pending).toBe(false);
    expect(findItem(result.sections, '/admin2/roles')?.pending).toBe(false);
    // Create Role and Access Control | By Role are two facets of one Roles destination.
    expect(findItem(result.sections, '/admin2/roles')?.menuIds.sort((a, b) => a - b)).toEqual([88, 154]);
    expect(findItem(result.sections, '/admin2/roles')?.tabs).toEqual(['details', 'access']);
    // User Mapping and Access Control are two views of one account on User Mapping.
    expect(findItem(result.sections, '/admin2/user-mapping')?.menuIds.sort((a, b) => a - b)).toEqual([91, 97]);
    expect(findItem(result.sections, '/admin2/user-mapping')?.tabs).toEqual(['mapping', 'access']);

    expect(result.unmapped).toEqual([]);
    expect(result.sections.some((candidate) => candidate.label === 'More')).toBe(false);
  });

  it('has no Legacy screens item in Administration 2.0, and still never drops an unported row', () => {
    // Claim KPI (100) has no screen and no blueprint entry. The Administration 2.0 group
    // lists built screens only; the row itself still renders — under More, pointing at the
    // placeholder — because a granted row is never dropped unless the blueprint hides it.
    const result = transformMenu([
      node(92, 'Administration 2.0', [node(87, 'Create Distributor'), node(100, 'Claim KPI'), node(232, 'User Roles')], 'cogs'),
    ]);
    const section = result.sections.find((candidate) => candidate.label === 'Administration 2.0');

    expect(section?.items.map((item) => item.route)).toEqual(['/admin2/distributors']);
    expect(findItem(result.sections, '/legacy/92')).toBeUndefined();

    expect(findItem(result.sections, '/legacy/100')?.pending).toBe(true);
    expect(result.unmapped.map((row) => row.menuId)).toEqual([100]);
  });

  it('keeps User Roles and User Regions out of the Administration 2.0 sidebar but granted', () => {
    const result = transformMenu([
      node(92, 'Administration 2.0', [node(87, 'Create Distributor'), node(232, 'User Roles'), node(233, 'User Regions')], 'cogs'),
    ]);

    expect(result.sidebar[0].children.map((child) => child.menuId)).toEqual([87]);
    expect(findItem(result.sections, '/legacy/232')).toBeUndefined();
    expect(result.grantedMenuIds.has(232)).toBe(true);
    expect(result.grantedMenuIds.has(233)).toBe(true);
  });

  it('keeps 2.0 rows that share a 1.0 name out of the 1.0 screens', () => {
    // "Access Control" is 19 in 1.0 and 97 in 2.0. Without 19 in the payload, 97 must not
    // name-match its way onto the Users screen's access tab.
    const result = transformMenu([ADMINISTRATION_2]);

    expect(result.nearMisses).toEqual([]);
    expect(findItem(result.sections, '/admin/users')).toBeUndefined();
    expect(findItem(result.sections, '/admin/roles')).toBeUndefined();
    expect(findItem(result.sections, '/admin/activity-logs')).toBeUndefined();
  });
});

describe('withAdminOnlyRoutes', () => {
  it('adds the menu-less admin screens only for an admin', () => {
    const { sections } = transformMenu([ADMINISTRATION]);

    expect(findItem(withAdminOnlyRoutes(sections, false), '/admin/menus')).toBeUndefined();
    expect(findItem(withAdminOnlyRoutes(sections, true), '/admin/menus')).toBeDefined();
  });

  it('does not mutate the sections it is given', () => {
    const { sections } = transformMenu([ADMINISTRATION]);
    const before = sections.flatMap((section) => section.items).length;
    withAdminOnlyRoutes(sections, true);
    expect(sections.flatMap((section) => section.items).length).toBe(before);
  });
});

describe('transformMenu sidebar', () => {
  const OCTANE_2_DASHBOARD = node(111, 'Octane 2.0 | Dashbaord', [], 'tachometer');

  it('keeps the grid’s roots, names and order instead of regrouping them', () => {
    const { sidebar } = transformMenu([ADMINISTRATION, FSD, OCTANE_2_DASHBOARD, ADMINISTRATION_2]);

    expect(sidebar.map((root) => root.menuId)).toEqual([4, 196, 111, 92]);
    expect(sidebar.map((root) => root.label)).toEqual([
      'Administration 1.0',
      'FSD Bulk Schemes',
      'Octane 2.0 | Dashbaord',
      'Administration 2.0',
    ]);
  });

  it('lists every granted sub-menu under its own grid name, in grid order, except hidden ones', () => {
    const [administration] = transformMenu([ADMINISTRATION]).sidebar;

    // `hidden` rows: "Edit Password" lives in the avatar menu; "Employee Resignation" is kept
    // out at the client's request. The four Users tabs are reached through "Create User".
    const absent = new Set([
      'Edit Password',
      'Employee Resignation',
      'Assign Role to User',
      'User Region Mapping',
      'User Brand Mapping',
      'Access Control',
    ]);
    expect(administration.children.map((child) => child.label)).toEqual(
      ADMINISTRATION.children.map((child) => child.name).filter((name) => !absent.has(name)),
    );
  });

  it('lists a Users tab only for someone without Create User, so nobody loses the way in', () => {
    const tabsOnly = node(4, 'Administration 1.0', [node(41, 'User Brand Mapping'), node(19, 'Access Control')]);
    const result = transformMenu([tabsOnly]);

    expect(result.sidebar[0].children.map((child) => [child.label, child.route, child.queryParams])).toEqual([
      ['User Brand Mapping', '/admin/users', { tab: 'brands' }],
      ['Access Control', '/admin/users', { tab: 'access' }],
    ]);
    expect(findItem(result.sections, '/admin/users')?.tabs).toEqual(['brands', 'access']);
  });

  it('opens a ported sub-menu on its screen, with the facet in the query string', () => {
    const ownership = node(4, 'Administration 1.0', [
      node(225, 'Change Budget Ownership'),
      node(226, 'Change Activity Ownership'),
    ]);
    const [root] = transformMenu([ownership]).sidebar;

    expect(root.children.map((child) => [child.route, child.queryParams, child.pending])).toEqual([
      ['/admin/ownership', { tab: 'budget' }, false],
      ['/admin/ownership', { tab: 'activity' }, false],
    ]);
  });

  it('sends an unported sub-menu to its own placeholder, not its module’s', () => {
    const [fsd] = transformMenu([FSD]).sidebar;

    expect(fsd.children.map((child) => [child.route, child.pending])).toEqual([
      ['/legacy/202', true],
      ['/legacy/217', true],
      ['/legacy/209', true],
    ]);
  });

  it('keeps Employee Resignation and Hierarchy out of Administration 1.0 but granted', () => {
    const withHierarchy = node(4, 'Administration 1.0', [
      node(17, 'Create User'),
      node(133, 'Employee Resignation'),
      node(135, 'Hierarchy'),
      node(22, 'Re-Route Scheme'),
    ]);
    const result = transformMenu([withHierarchy]);

    expect(result.sidebar[0].children.map((child) => child.label)).toEqual(['Create User', 'Re-Route Scheme']);
    expect(findItem(result.sections, '/legacy/135')).toBeUndefined();
    expect(result.grantedMenuIds.has(133)).toBe(true);
    expect(result.grantedMenuIds.has(135)).toBe(true);
  });

  it('uses the grid’s icon, then the blueprint’s, then the default', () => {
    const psPortal = node(192, 'PS Portal');
    const unknown = node(999, 'Something New');
    const sidebar = transformMenu([ADMINISTRATION, psPortal, unknown]).sidebar;

    expect(sidebar.map((root) => root.icon)).toEqual(['settings', 'device-desktop', 'circle-dot']);
  });

  it('trims the stray whitespace some grid names carry', () => {
    const [root] = transformMenu([node(144, 'High Octane', [node(153, 'Loose Milk Collection  ')])]).sidebar;

    expect(root.children[0].label).toBe('Loose Milk Collection');
  });
});

describe('withAdminOnlySidebarEntries', () => {
  it('lists the Unset admin screens under Administration 1.0 for an admin only', () => {
    const { sidebar } = transformMenu([ADMINISTRATION, FSD]);
    const labels = (isAdmin: boolean): string[] =>
      withAdminOnlySidebarEntries(sidebar, isAdmin)[0].children.map((child) => child.label);

    expect(labels(false)).not.toContain('Add Menu');
    expect(labels(true).slice(-2)).toEqual(['Add Menu', 'Freq Config']);
  });

  it('does not repeat a screen the menu already carries', () => {
    const withAddMenu = node(4, 'Administration 1.0', [node(17, 'Create User'), node(235, 'Add Menu')]);
    const [root] = withAdminOnlySidebarEntries(transformMenu([withAddMenu]).sidebar, true);

    expect(root.children.filter((child) => child.route === '/admin/menus')).toHaveLength(1);
  });

  it('does not mutate the sidebar it is given', () => {
    const { sidebar } = transformMenu([ADMINISTRATION]);
    const before = sidebar[0].children.length;
    withAdminOnlySidebarEntries(sidebar, true);
    expect(sidebar[0].children.length).toBe(before);
  });
});

describe('tablerIconFor', () => {
  it('maps the FontAwesome 4 names the legacy menu stores', () => {
    expect(tablerIconFor('cogs')).toBe('settings');
    expect(tablerIconFor('pencil-square-o')).toBe('pencil');
  });

  it('returns null for absent or unrecognised icons so the caller can fall back', () => {
    expect(tablerIconFor(null)).toBeNull();
    expect(tablerIconFor('not-a-real-icon')).toBeNull();
  });
});
