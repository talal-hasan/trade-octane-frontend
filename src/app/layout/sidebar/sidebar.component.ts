import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TooltipModule } from 'primeng/tooltip';

import { MenuAccessService } from '../../core/services/menu-access.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { TransformedNavItem } from '../../core/menu/menu-transform';
import { ICON_REGISTRY } from '../../shared/icon-registry';
import { ClaimsService } from '../../features/claims/services/claims.service';

/**
 * The sidebar renders the user's **real menu grants**, folded (CLAUDE.md §4: "the nav is
 * generated dynamically from what the current user can access — never hardcoded").
 *
 * It used to filter a static NAV_SECTIONS array against invented permission strings. It
 * now reads MenuAccessService, which folds `GET /identity/menu` through the blueprint —
 * so 95 legacy menu rows become ~28 destinations, and a user who was granted only "User
 * Brand Mapping" sees one "Users" item rather than nothing.
 *
 * There is no filtering left to do here: an item exists only because a grant produced it.
 */
@Component({
  selector: 'to-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TablerIconComponent, TooltipModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  protected readonly icons = ICON_REGISTRY;
  protected readonly sidebarService = inject(SidebarService);
  protected readonly collapsed = this.sidebarService.collapsed;

  private readonly menuAccess = inject(MenuAccessService);
  private readonly claimsService = inject(ClaimsService);

  protected readonly sections = this.menuAccess.sections;

  // Pending-count badges (CLAUDE.md §6). Sourced from the live claims store, so a claim
  // approved anywhere in the app decrements the badge with no refetch — the same rule the
  // Dashboard follows.
  private readonly pendingClaims = computed(
    () => this.claimsService.claims().filter((claim) => claim.status === 'pending').length,
  );

  /**
   * Badges attach by route rather than by a `badgeKey` on a static definition, because the
   * nav items are now derived and carry no hand-authored metadata.
   */
  protected badgeFor(item: TransformedNavItem): number {
    if (item.pending) {
      return 0;
    }
    return item.route === '/claims' || item.route === '/workspace' ? this.pendingClaims() : 0;
  }

  /**
   * Tooltip text. In the icon rail the label alone is not always enough — a folded item
   * absorbed several legacy screens, and naming them is how someone trained on the old
   * menu recognises where their screen went.
   */
  protected tooltipFor(item: TransformedNavItem): string {
    const extras = item.aliases.filter((alias) => alias !== item.label);
    if (extras.length === 0) {
      return item.label;
    }
    return `${item.label} — ${extras.slice(0, 4).join(', ')}${extras.length > 4 ? '…' : ''}`;
  }

  /** Falls back to a known-present icon so an unmapped legacy icon never renders blank. */
  protected iconFor(item: TransformedNavItem): string {
    return item.icon in this.icons ? item.icon : 'circle-dot';
  }

  toggle(): void {
    this.sidebarService.toggle();
  }
}
