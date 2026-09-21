import { Component, computed, input, output, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TooltipModule } from 'primeng/tooltip';

import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { MenuIndex, MenuRow, descendantsOf } from '../distributor-access.util';

/** A menu item flattened for rendering, with everything its row displays worked out once. */
export interface MenuGrantRow {
  item: MenuRow;
  menuId: number;
  depth: number;
  /** In the set being edited — what every selected distributor will hold after a save. */
  checked: boolean;
  hasChildren: boolean;
  expanded: boolean;
  /**
   * How many of the selected distributors hold it **now**. Null when their grants were not
   * loaded, which is the case for a selection over `DETAIL_LIMIT`.
   */
  heldBy: number | null;
  /** Ticked and total items in this item's subtree, itself included. Parents only. */
  subtree: { ticked: number; total: number } | null;
  /** Stored by at least one selected distributor while its parent is not, so never shown. */
  storedOrphan: boolean;
}

/**
 * The distributor portal's menu as a checkbox tree — legacy's `trv_Menu`, with the things
 * it could not say made visible.
 *
 * **The checkbox is the target, not the current state.** It means "every selected
 * distributor holds this after saving", because that is what `PUT .../menus` writes: one
 * menu set applied to all of them. Where they differ today, the row says so in a separate
 * `3 of 7` badge rather than showing an indeterminate tick — a tri-state box would have to
 * resolve to on or off on save anyway, and hiding which way it goes is exactly how an
 * access screen loses someone's trust.
 *
 * **A parent's checkbox is its own grant**, not a roll-up: these parents are real menu rows
 * with their own page. The `2/4` pill beside one is the subtree summary, and toggles it.
 *
 * Built here rather than on 1.0's `to-access-tree`: that tree's second state is
 * role-inherited access, which distributors do not have, and it has no notion of a
 * selection spanning several holders. Same CSS idiom and the same native-checkbox choice.
 */
@Component({
  selector: 'to-menu-grant-tree',
  standalone: true,
  imports: [TablerIconComponent, TooltipModule],
  templateUrl: './menu-grant-tree.component.html',
  styleUrl: './menu-grant-tree.component.scss',
})
export class MenuGrantTreeComponent {
  readonly index = input.required<MenuIndex>();
  /** The set being edited. */
  readonly selected = input.required<ReadonlySet<number>>();
  /** Menu id → how many of the selected distributors hold it now. Empty in template mode. */
  readonly holders = input<ReadonlyMap<number, number>>(new Map<number, number>());
  /** How many distributors' stored grants are known. 0 turns the `n of m` badges off. */
  readonly holderCount = input(0);
  /** Stored grants whose parent is not stored — flagged, never silently repaired. */
  readonly storedOrphans = input<ReadonlySet<number>>(new Set<number>());
  readonly disabled = input(false);
  /** Free-text filter over menu name and page. */
  readonly filter = input('');

  readonly toggled = output<{ menuId: number; checked: boolean }>();
  readonly subtreeToggled = output<{ menuId: number; checked: boolean }>();

  protected readonly icons = ICON_REGISTRY;
  private readonly collapsed = signal<ReadonlySet<number>>(new Set<number>());

  /**
   * Flattens the tree into rows.
   *
   * A parent whose own name does not match the filter is kept when a child matches:
   * otherwise a bare "Ledger" row loses the "One Window" above it that says where it lives.
   */
  protected readonly rows = computed<MenuGrantRow[]>(() => {
    const index = this.index();
    const selected = this.selected();
    const holders = this.holders();
    const holderCount = this.holderCount();
    const orphans = this.storedOrphans();
    const collapsed = this.collapsed();
    const term = this.filter().trim().toLowerCase();

    const matches = (item: MenuRow): boolean =>
      !term ||
      item.menuName.toLowerCase().includes(term) ||
      item.menuPage.toLowerCase().includes(term);

    const build = (item: MenuRow, depth: number, forced: boolean): MenuGrantRow[] => {
      const children = item.childIds
        .map((id) => index.byId.get(id))
        .filter((child): child is MenuRow => child !== undefined);
      const selfMatches = matches(item);
      const shown = forced || selfMatches;
      // A parent the filter did not match is still worth a row when a child matched.
      const matchingChildren = children.filter((child) => shown || matches(child));
      if (!shown && matchingChildren.length === 0) {
        return [];
      }

      const descendants = descendantsOf(index, item.menuId);
      const isCollapsed = collapsed.has(item.menuId) && !term;

      const row: MenuGrantRow = {
        item,
        menuId: item.menuId,
        depth,
        checked: selected.has(item.menuId),
        hasChildren: children.length > 0,
        expanded: !isCollapsed,
        heldBy: holderCount > 0 ? (holders.get(item.menuId) ?? 0) : null,
        subtree:
          children.length > 0
            ? {
                ticked: [item.menuId, ...descendants].filter((id) => selected.has(id)).length,
                total: descendants.length + 1,
              }
            : null,
        storedOrphan: orphans.has(item.menuId),
      };

      if (isCollapsed) {
        return [row];
      }

      // When the parent matched, show all of its children: the admin searched for the
      // module and wants the module.
      return [row, ...matchingChildren.flatMap((child) => build(child, depth + 1, shown))];
    };

    return index.roots.flatMap((root) => build(root, 0, false));
  });

  protected readonly isEmpty = computed(() => this.rows().length === 0);

  protected toggleExpand(menuId: number): void {
    this.collapsed.update((current) => {
      const next = new Set(current);
      if (!next.delete(menuId)) {
        next.add(menuId);
      }
      return next;
    });
  }

  protected onToggle(row: MenuGrantRow): void {
    if (this.disabled()) {
      return;
    }
    this.toggled.emit({ menuId: row.menuId, checked: !row.checked });
  }

  protected onSubtree(row: MenuGrantRow): void {
    if (this.disabled() || !row.subtree) {
      return;
    }
    // All of it ticked → clear the branch; anything else → tick the branch.
    this.subtreeToggled.emit({
      menuId: row.menuId,
      checked: row.subtree.ticked < row.subtree.total,
    });
  }

  /** The current spread across the selection, where it is not uniform. */
  protected spreadLabel(row: MenuGrantRow): string | null {
    const held = row.heldBy;
    const total = this.holderCount();
    if (held === null || total < 2 || held === 0 || held === total) {
      return null;
    }
    return `${held} of ${total}`;
  }

  protected spreadTooltip(row: MenuGrantRow): string {
    const held = row.heldBy ?? 0;
    const total = this.holderCount();
    return row.checked
      ? `${total - held} of the ${total} selected distributors will gain this.`
      : `${held} of the ${total} selected distributors hold this now and will lose it.`;
  }

  protected subtreeTooltip(row: MenuGrantRow): string {
    if (!row.subtree) {
      return '';
    }
    return row.subtree.ticked === row.subtree.total
      ? `Untick ${row.item.menuName} and everything under it.`
      : `Tick ${row.item.menuName} and everything under it.`;
  }
}
