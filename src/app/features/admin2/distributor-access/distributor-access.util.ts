import { DistributorMenuResponse } from '../../../core/api/admin2.models';
import { int } from '../../../core/api/api.types';

/** Where the screen lives, so links to it are written once. */
export const DISTRIBUTOR_ACCESS_ROUTE = '/admin2/distributor-access';

/**
 * How many distributors the editor loads grant by grant. Under this, the tree shows which
 * of them hold each item and the save states its exact effect; over it, the ticked set is
 * applied as a template. The server takes up to 1,000 distributors in one write either way.
 */
export const DETAIL_LIMIT = 25;

/** One menu item, flattened out of the tree with what the selection maths needs. */
export interface MenuRow {
  menuId: number;
  menuName: string;
  menuPage: string;
  depth: number;
  /** 0 at the top level. */
  parentId: number;
  childIds: readonly number[];
}

/**
 * The menu catalogue in the one shape every operation here needs: display order, and
 * parent/child links by id. Built once per catalogue load — the alternative is walking the
 * tree inside computed signals that re-run on every keystroke.
 */
export interface MenuIndex {
  /** Every item, each parent before its children, in sidebar order. */
  rows: readonly MenuRow[];
  byId: ReadonlyMap<number, MenuRow>;
  /** Top-level items, in sidebar order. */
  roots: readonly MenuRow[];
}

export function buildMenuIndex(menus: readonly DistributorMenuResponse[]): MenuIndex {
  const rows: MenuRow[] = [];
  const byId = new Map<number, MenuRow>();

  const walk = (nodes: readonly DistributorMenuResponse[], depth: number, parentId: number): void => {
    for (const node of nodes) {
      const menuId = int(node.menuId);
      const row: MenuRow = {
        menuId,
        menuName: node.menuName,
        menuPage: node.menuPage,
        depth,
        parentId,
        childIds: node.children.map((child) => int(child.menuId)),
      };
      rows.push(row);
      byId.set(menuId, row);
      walk(node.children, depth + 1, menuId);
    }
  };
  walk(menus, 0, 0);

  return { rows, byId, roots: rows.filter((row) => row.depth === 0) };
}

/** Every id beneath `menuId`, at any depth. */
export function descendantsOf(index: MenuIndex, menuId: number): number[] {
  const out: number[] = [];
  const stack = [...(index.byId.get(menuId)?.childIds ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as number;
    out.push(id);
    stack.push(...(index.byId.get(id)?.childIds ?? []));
  }
  return out;
}

/** The parent of `menuId`, then its parent, and so on — nearest first. */
export function ancestorsOf(index: MenuIndex, menuId: number): number[] {
  const out: number[] = [];
  let parentId = index.byId.get(menuId)?.parentId ?? 0;
  while (parentId !== 0 && index.byId.has(parentId) && !out.includes(parentId)) {
    out.push(parentId);
    parentId = index.byId.get(parentId)?.parentId ?? 0;
  }
  return out;
}

/**
 * Ticks or unticks one item, keeping the result grantable.
 *
 * Ticking a child grants its parents too, and unticking a parent revokes everything under
 * it. Both directions exist for one reason: the distributor sidebar lists only the children
 * of a granted parent, so a child without its parent is stored and never shown — the state
 * legacy saved 200 of, and the state `PUT .../menus` refuses.
 */
export function cascadeToggle(
  selected: ReadonlySet<number>,
  index: MenuIndex,
  menuId: number,
  checked: boolean,
): Set<number> {
  const next = new Set(selected);
  if (checked) {
    next.add(menuId);
    for (const id of ancestorsOf(index, menuId)) {
      next.add(id);
    }
  } else {
    next.delete(menuId);
    for (const id of descendantsOf(index, menuId)) {
      next.delete(id);
    }
  }
  return next;
}

/** Ticks a parent and everything under it, or unticks the lot. */
export function toggleSubtree(
  selected: ReadonlySet<number>,
  index: MenuIndex,
  menuId: number,
  checked: boolean,
): Set<number> {
  const next = new Set(selected);
  for (const id of [menuId, ...descendantsOf(index, menuId)]) {
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  if (checked) {
    for (const id of ancestorsOf(index, menuId)) {
      next.add(id);
    }
  }
  return next;
}

/** Every id in the catalogue. What Select all ticks. */
export function allMenuIds(index: MenuIndex): Set<number> {
  return new Set(index.rows.map((row) => row.menuId));
}

/**
 * The ticked ids whose parent is not ticked — grants the sidebar would never show.
 *
 * `cascadeToggle` cannot produce one, so anything here came from what a distributor
 * already holds, and is reported rather than silently repaired.
 */
export function orphansIn(selected: ReadonlySet<number>, index: MenuIndex): number[] {
  const out: number[] = [];
  for (const menuId of selected) {
    const parentId = index.byId.get(menuId)?.parentId ?? 0;
    if (parentId !== 0 && index.byId.has(parentId) && !selected.has(parentId)) {
      out.push(menuId);
    }
  }
  return out.sort((a, b) => a - b);
}

/** Stored ids the catalogue has no item for. A save drops them; the server would refuse them. */
export function unknownIn(stored: Iterable<number>, index: MenuIndex): number[] {
  const out: number[] = [];
  for (const menuId of stored) {
    if (!index.byId.has(menuId)) {
      out.push(menuId);
    }
  }
  return out.sort((a, b) => a - b);
}

/** How many of the given sets hold each menu id. Drives the tree's partial state. */
export function tally(sets: readonly ReadonlySet<number>[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const set of sets) {
    for (const menuId of set) {
      counts.set(menuId, (counts.get(menuId) ?? 0) + 1);
    }
  }
  return counts;
}

/** Everything held by at least one of them, catalogue items only. */
export function unionOf(sets: readonly ReadonlySet<number>[], index: MenuIndex): Set<number> {
  const out = new Set<number>();
  for (const set of sets) {
    for (const menuId of set) {
      if (index.byId.has(menuId)) {
        out.add(menuId);
      }
    }
  }
  return out;
}

/** Everything held by all of them, catalogue items only. Empty when there are no sets. */
export function intersectionOf(sets: readonly ReadonlySet<number>[], index: MenuIndex): Set<number> {
  if (sets.length === 0) {
    return new Set<number>();
  }
  const out = new Set<number>();
  for (const menuId of sets[0]) {
    if (index.byId.has(menuId) && sets.every((set) => set.has(menuId))) {
      out.add(menuId);
    }
  }
  return out;
}

/** What saving the ticked set would do to one distributor. */
export interface DistributorImpact {
  distributorId: string;
  added: number[];
  removed: number[];
}

export interface SaveImpact {
  /** Only the distributors something would actually change for. */
  changes: DistributorImpact[];
  addedCount: number;
  removedCount: number;
  /** Distributors whose stored set already matches the ticked one. */
  unchangedCount: number;
}

/**
 * The exact effect of saving `target`, for each distributor whose stored grants are known —
 * so the screen can state it before the write rather than report it afterwards.
 *
 * A stored id the catalogue has no item for counts as removed, because the write replaces
 * the set with exactly `target`.
 */
export function saveImpact(
  target: ReadonlySet<number>,
  stored: ReadonlyMap<string, ReadonlySet<number>>,
): SaveImpact {
  const changes: DistributorImpact[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;

  for (const [distributorId, current] of stored) {
    const added: number[] = [];
    const removed: number[] = [];
    for (const menuId of target) {
      if (!current.has(menuId)) {
        added.push(menuId);
      }
    }
    for (const menuId of current) {
      if (!target.has(menuId)) {
        removed.push(menuId);
      }
    }
    if (added.length === 0 && removed.length === 0) {
      unchangedCount++;
      continue;
    }
    added.sort((a, b) => a - b);
    removed.sort((a, b) => a - b);
    addedCount += added.length;
    removedCount += removed.length;
    changes.push({ distributorId, added, removed });
  }

  return { changes, addedCount, removedCount, unchangedCount };
}
