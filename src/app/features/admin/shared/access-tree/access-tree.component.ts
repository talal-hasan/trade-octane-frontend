import { Component, computed, input, output, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TooltipModule } from 'primeng/tooltip';

import { AccessNodeResponse } from '../../../../core/api/admin.models';
import { int } from '../../../../core/api/api.types';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';

/** A node flattened for rendering, with its depth and its resolved grant state. */
export interface AccessTreeRow {
  node: AccessNodeResponse;
  menuId: number;
  depth: number;
  /** Ticked in the editor — i.e. present in the *direct* grant set being edited. */
  checked: boolean;
  /** Granted by a role. Cannot be removed here, so the control is locked. */
  inherited: boolean;
  hasChildren: boolean;
  expanded: boolean;
}

/**
 * The menu access tree — legacy's `trv_Menu`, with the three things it could not
 * distinguish made visible.
 *
 * **The rule that makes this screen correct:** the checkbox is bound to the *direct* grant
 * set, never to the effective one. A row a role already grants shows as granted and is
 * locked, because `PUT …/access` cannot remove role-derived access — binding the control
 * to `effectiveMenuIds` would produce a tick that silently refuses to clear, which is the
 * single most confusing thing an access screen can do.
 *
 * So each row reports three separate facts:
 *   • is it directly granted (editable, the checkbox)
 *   • is it role-granted (locked, with the granting roles named on hover)
 *   • is it orphaned or inactive (a grant that cannot authorise anything)
 */
@Component({
  selector: 'to-access-tree',
  standalone: true,
  imports: [TablerIconComponent, TooltipModule],
  templateUrl: './access-tree.component.html',
  styleUrl: './access-tree.component.scss',
})
export class AccessTreeComponent {
  readonly tree = input.required<readonly AccessNodeResponse[]>();
  /** The editable set. For a user this is `directMenuIds`; for a role, `menuIds`. */
  readonly selected = input.required<ReadonlySet<number>>();
  /**
   * Granted by a role rather than directly. Empty on the role screen, where there is no
   * inheritance to show.
   */
  readonly inherited = input<ReadonlySet<number>>(new Set<number>());
  readonly disabled = input(false);
  /** Free-text filter over menu name and page. */
  readonly filter = input('');

  readonly toggled = output<{ menuId: number; checked: boolean }>();

  protected readonly icons = ICON_REGISTRY;
  private readonly collapsed = signal<ReadonlySet<number>>(new Set<number>());

  /**
   * Flattens the two-level tree into rows.
   *
   * A parent whose own name does not match the filter is still shown when one of its
   * children does — otherwise filtering hides the context that tells you *where* the
   * matched row lives, and a bare "Approval" row means nothing without "Hub & Spoke"
   * above it.
   */
  protected readonly rows = computed<AccessTreeRow[]>(() => {
    const selected = this.selected();
    const inherited = this.inherited();
    const collapsed = this.collapsed();
    const term = this.filter().trim().toLowerCase();

    const matches = (node: AccessNodeResponse): boolean =>
      !term ||
      node.menuName.toLowerCase().includes(term) ||
      (node.menuPage ?? '').toLowerCase().includes(term);

    const rows: AccessTreeRow[] = [];
    for (const parent of this.tree()) {
      const children = parent.children ?? [];
      const matchingChildren = children.filter(matches);
      const parentMatches = matches(parent);
      if (!parentMatches && matchingChildren.length === 0) {
        continue;
      }

      const parentId = int(parent.menuId);
      const isCollapsed = collapsed.has(parentId) && !term;
      rows.push({
        node: parent,
        menuId: parentId,
        depth: 0,
        checked: selected.has(parentId),
        inherited: inherited.has(parentId),
        hasChildren: children.length > 0,
        expanded: !isCollapsed,
      });

      if (isCollapsed) {
        continue;
      }

      // When the parent itself matched, show all of its children; the user searched for
      // the module and wants the module.
      for (const child of parentMatches ? children : matchingChildren) {
        const childId = int(child.menuId);
        rows.push({
          node: child,
          menuId: childId,
          depth: 1,
          checked: selected.has(childId),
          inherited: inherited.has(childId),
          hasChildren: false,
          expanded: true,
        });
      }
    }
    return rows;
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

  protected onToggle(row: AccessTreeRow): void {
    if (this.disabled() || row.inherited) {
      return;
    }
    this.toggled.emit({ menuId: row.menuId, checked: !row.checked });
  }

  /** Why a row is locked, named rather than merely disabled. */
  protected inheritedTooltip(row: AccessTreeRow): string {
    const roles = row.node.grantingRoles ?? [];
    if (roles.length === 0) {
      return 'Granted by a role. Remove the role to revoke it.';
    }
    return `Granted by ${roles.join(', ')}. Remove the role to revoke it.`;
  }

  /**
   * A grant that exists but cannot authorise anything. Worth flagging on its own row —
   * these are exactly the rows an admin thinks are working and are not.
   */
  protected deadReason(row: AccessTreeRow): string | null {
    if (row.node.isOrphaned) {
      return 'Orphaned — the menu item this grant points at no longer exists.';
    }
    if (!row.node.isActive) {
      return 'Hidden — this menu item is not active, so the grant has no effect.';
    }
    return null;
  }
}
