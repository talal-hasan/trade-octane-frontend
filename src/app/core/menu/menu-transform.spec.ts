import { MenuItemResponse } from '../api/identity.models';
import { transformMenu, withAdminOnlyRoutes, tablerIconFor } from './menu-transform';

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

    // Users folds seven rows. "Employee Resignation" (133) is still unported, but the
    // other six are built — one ported contributor is enough for the destination.
    expect(findItem(result.sections, '/admin/users')?.pending).toBe(false);

    // A module with no ported row anywhere stays pending and routes to the placeholder.
    expect(findItem(result.sections, '/legacy/196')?.pending).toBe(true);
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
