import { Component, computed, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TooltipModule } from 'primeng/tooltip';
import { filter, map } from 'rxjs';

import { MenuAccessService } from '../../core/services/menu-access.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { SidebarMenuNode } from '../../core/menu/menu-transform';
import { ICON_REGISTRY } from '../../shared/icon-registry';

/**
 * The sidebar renders the user's **real menu grants** in the shape the Menus grid
 * (`/admin/menus`, legacy Add_Menu_Items.aspx) gives them — the client's requirement, and
 * what the legacy master page drew: each root module under its grid name and icon, in grid
 * order, opening onto the sub-menus the user holds.
 *
 * There is no filtering left to do here: an entry exists only because a grant produced it,
 * and only Visible rows are granted (see `AccessSql.EffectiveMenu`).
 */
@Component({
  selector: 'to-sidebar',
  standalone: true,
  imports: [RouterLink, TablerIconComponent, TooltipModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected readonly icons = ICON_REGISTRY;
  protected readonly sidebarService = inject(SidebarService);
  protected readonly collapsed = this.sidebarService.collapsed;

  private readonly menuAccess = inject(MenuAccessService);
  private readonly router = inject(Router);

  protected readonly menu = this.menuAccess.sidebar;

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * The one entry that is "you are here". Several entries can open the same screen — the
   * six Users rows all open `/admin/users` — so `routerLinkActive` would light every one of
   * them; this picks a single winner instead. See `activeEntry`.
   */
  protected readonly activeMenuId = computed(
    () => activeEntry(this.menu(), this.url(), this.router.parseUrl(this.url()).queryParams)?.menuId ?? null,
  );

  /** The module holding the active entry. */
  protected readonly activeModuleId = computed(() => {
    const active = this.activeMenuId();
    const holder = this.menu().find(
      (root) => root.menuId === active || root.children.some((child) => child.menuId === active),
    );
    return holder?.menuId ?? null;
  });

  /**
   * The open module. One at a time, as legacy's accordion was; it follows navigation to the
   * module being worked in, and can be opened or closed by hand in between.
   */
  protected readonly openModuleId = linkedSignal(() => this.activeModuleId());

  protected toggleModule(root: SidebarMenuNode): void {
    // The rail has no room for sub-menus, so a module opens the sidebar rather than a flyout.
    if (this.collapsed()) {
      this.sidebarService.toggle();
      this.openModuleId.set(root.menuId);
      return;
    }
    this.openModuleId.update((open) => (open === root.menuId ? null : root.menuId));
  }

  /** Falls back to a known-present icon so an unmapped legacy icon never renders blank. */
  protected iconFor(node: SidebarMenuNode): string {
    return node.icon in this.icons ? node.icon : 'circle-dot';
  }

  toggle(): void {
    this.sidebarService.toggle();
  }
}

/**
 * The entry the URL is on: among entries whose route is the path or a prefix of it, the
 * longest route wins; on a tie, one whose facet the URL is on beats one that names none,
 * which beats one naming a different facet (`/admin/ownership?tab=activity` is Change
 * Activity Ownership, not Change Budget Ownership). The facet can also be the last path
 * segment, since a role's access tree is `/admin2/roles/7/access`. Remaining ties go to the
 * first in grid order.
 */
function activeEntry(menu: readonly SidebarMenuNode[], url: string, query: Params): SidebarMenuNode | null {
  const path = url.split(/[?#]/)[0];
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  let best: SidebarMenuNode | null = null;
  let bestScore = -1;
  for (const node of menu.flatMap((root) => (root.children.length > 0 ? root.children : [root]))) {
    if (path !== node.route && !path.startsWith(`${node.route}/`)) {
      continue;
    }
    const params = node.queryParams;
    const onFacet = (entry: [string, string]): boolean => query[entry[0]] === entry[1] || lastSegment === entry[1];
    const facet = !params ? 1 : Object.entries(params).every(onFacet) ? 2 : 0;
    const score = node.route.length * 3 + facet;
    if (score > bestScore) {
      best = node;
      bestScore = score;
    }
  }
  return best;
}
