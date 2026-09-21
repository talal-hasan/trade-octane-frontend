import { DistributorMenuResponse } from '../../../core/api/admin2.models';
import {
  buildMenuIndex,
  cascadeToggle,
  intersectionOf,
  orphansIn,
  saveImpact,
  tally,
  toggleSubtree,
  unionOf,
  unknownIn,
} from './distributor-access.util';

function menu(menuId: number, menuName: string, children: DistributorMenuResponse[] = []): DistributorMenuResponse {
  return { menuId, menuName, menuPage: `${menuName}.aspx`, orderId: menuId, children };
}

// The real catalogue's shape and ids, trimmed: 15 top-level items of which only One Window
// (19) and ROI Reports (25) have children — 23 items, 8 of them children.
const MENUS: DistributorMenuResponse[] = [
  menu(1, 'Dashboard'),
  menu(2, 'Claim Module'),
  menu(19, 'One Window', [menu(20, 'Ledger'), menu(21, 'SIDA Amount'), menu(22, 'SIDA SOP')]),
  menu(25, 'ROI Reports', [menu(26, 'Market Credit Report'), menu(27, 'Vans Report')]),
];

const INDEX = buildMenuIndex(MENUS);

describe('buildMenuIndex', () => {
  it('flattens parents before their children, in sidebar order', () => {
    expect(INDEX.rows.map((row) => row.menuId)).toEqual([1, 2, 19, 20, 21, 22, 25, 26, 27]);
    expect(INDEX.roots.map((row) => row.menuId)).toEqual([1, 2, 19, 25]);
  });

  it('records the parent of a child and 0 for a top-level item', () => {
    expect(INDEX.byId.get(20)?.parentId).toBe(19);
    expect(INDEX.byId.get(19)?.parentId).toBe(0);
    expect(INDEX.byId.get(19)?.childIds).toEqual([20, 21, 22]);
  });

  it('reads wire integers that arrive as strings', () => {
    const index = buildMenuIndex([{ ...menu(18, 'Helpdesk'), menuId: '18', orderId: '0' }]);
    expect(index.rows[0].menuId).toBe(18);
  });
});

describe('cascadeToggle', () => {
  it('grants the parent when a child is ticked, because the sidebar hides an orphan', () => {
    expect([...cascadeToggle(new Set(), INDEX, 20, true)].sort((a, b) => a - b)).toEqual([19, 20]);
  });

  it('revokes the children when a parent is unticked', () => {
    const selected = new Set([19, 20, 21, 25, 26]);
    expect([...cascadeToggle(selected, INDEX, 19, false)].sort((a, b) => a - b)).toEqual([25, 26]);
  });

  it('leaves the parent granted when one child is unticked', () => {
    expect([...cascadeToggle(new Set([19, 20, 21]), INDEX, 21, false)].sort((a, b) => a - b)).toEqual([19, 20]);
  });

  it('never produces an orphan from an empty start', () => {
    let selected: ReadonlySet<number> = new Set<number>();
    for (const menuId of [22, 27, 2]) {
      selected = cascadeToggle(selected, INDEX, menuId, true);
    }
    expect(orphansIn(selected, INDEX)).toEqual([]);
  });

  it('does not mutate the set it was given', () => {
    const selected = new Set([19]);
    cascadeToggle(selected, INDEX, 20, true);
    expect([...selected]).toEqual([19]);
  });
});

describe('toggleSubtree', () => {
  it('ticks a parent and everything under it', () => {
    expect([...toggleSubtree(new Set(), INDEX, 19, true)].sort((a, b) => a - b)).toEqual([19, 20, 21, 22]);
  });

  it('unticks the whole subtree and leaves the rest alone', () => {
    const selected = new Set([1, 19, 20, 21, 22]);
    expect([...toggleSubtree(selected, INDEX, 19, false)].sort((a, b) => a - b)).toEqual([1]);
  });
});

describe('orphansIn', () => {
  it('finds a child granted without its parent — the 200 grants already stored that way', () => {
    expect(orphansIn(new Set([20, 25, 26]), INDEX)).toEqual([20]);
  });

  it('does not call a top-level item an orphan', () => {
    expect(orphansIn(new Set([1, 2]), INDEX)).toEqual([]);
  });
});

describe('unknownIn', () => {
  it('reports stored ids the catalogue has no item for', () => {
    expect(unknownIn([1, 999, 20], INDEX)).toEqual([999]);
  });
});

describe('tally, unionOf and intersectionOf', () => {
  const sets = [new Set([1, 2, 19]), new Set([1, 19, 20]), new Set([1])];

  it('counts how many hold each item', () => {
    expect(tally(sets).get(1)).toBe(3);
    expect(tally(sets).get(19)).toBe(2);
    expect(tally(sets).get(2)).toBe(1);
  });

  it('unions and intersects, dropping ids the catalogue does not hold', () => {
    expect([...unionOf([...sets, new Set([999])], INDEX)].sort((a, b) => a - b)).toEqual([1, 2, 19, 20]);
    expect([...intersectionOf(sets, INDEX)]).toEqual([1]);
  });

  it('intersects to nothing when no distributor is selected', () => {
    expect(intersectionOf([], INDEX).size).toBe(0);
  });
});

describe('saveImpact', () => {
  it('reports what each distributor gains and loses, and who is untouched', () => {
    const impact = saveImpact(
      new Set([1, 19, 20]),
      new Map([
        ['D1', new Set([1, 19, 20])],
        ['D2', new Set([1])],
        ['D3', new Set([2, 19, 20])],
      ]),
    );

    expect(impact.unchangedCount).toBe(1);
    expect(impact.changes).toEqual([
      { distributorId: 'D2', added: [19, 20], removed: [] },
      { distributorId: 'D3', added: [1], removed: [2] },
    ]);
    expect(impact.addedCount).toBe(3);
    expect(impact.removedCount).toBe(1);
  });

  it('counts a stored id the catalogue lost as removed, because the write replaces the set', () => {
    const impact = saveImpact(new Set([1]), new Map([['D1', new Set([1, 999])]]));
    expect(impact.changes).toEqual([{ distributorId: 'D1', added: [], removed: [999] }]);
  });

  it('is empty for a selection whose grants are not loaded', () => {
    expect(saveImpact(new Set([1]), new Map())).toEqual({
      changes: [],
      addedCount: 0,
      removedCount: 0,
      unchangedCount: 0,
    });
  });
});
