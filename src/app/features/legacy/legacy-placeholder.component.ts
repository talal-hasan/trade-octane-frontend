import { Component, computed, inject, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';

import { MenuAccessService } from '../../core/services/menu-access.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ICON_REGISTRY } from '../../shared/icon-registry';

/**
 * The destination for a granted menu row whose screen has not been ported yet.
 *
 * This exists because of the rule in menu-blueprint.ts: **an unmapped or unported menu row
 * is never dropped from the navigation.** A user who holds "Auto Replenishment" sees it,
 * because hiding it would be a silent lie about their access. What they must not get is a
 * blank page or a 404 — so they get this: what the item is, which legacy screens it
 * covers, and the fact that it is still served by the old portal.
 *
 * It is also the safety net for menu rows the backend adds after this build. Those arrive
 * with no blueprint entry at all and land here rather than nowhere.
 */
@Component({
  selector: 'to-legacy-placeholder',
  standalone: true,
  imports: [TablerIconComponent, ButtonModule, PageHeaderComponent],
  template: `
    <to-page-header
      [title]="item()?.label ?? 'Not available yet'"
      subtitle="This screen is still served by the legacy Trade Octane portal."
      [breadcrumbs]="[{ label: 'Home', route: '/' }, { label: item()?.label ?? 'Legacy' }]"
    />

    <div class="to-legacy">
      <span class="to-legacy__mark">
        <tabler-icon [icon]="icons['external-link']" [size]="24" />
      </span>

      <h2 class="to-legacy__heading">Not ported yet</h2>
      <p class="to-legacy__body">
        You have access to this module — it just has not moved to the new portal yet.
        Continue using it in the legacy system for now.
      </p>

      @if (coveredScreens().length > 0) {
        <div class="to-legacy__covers">
          <span class="to-legacy__covers-label">Covers</span>
          <ul class="to-legacy__list">
            @for (screen of coveredScreens(); track screen) {
              <li class="to-legacy__chip">{{ screen }}</li>
            }
          </ul>
        </div>
      }
    </div>
  `,
  styleUrl: './legacy-placeholder.component.scss',
})
export class LegacyPlaceholderComponent {
  /** Bound from the route via `withComponentInputBinding()`. */
  readonly menuId = input<string>('');

  protected readonly icons = ICON_REGISTRY;
  private readonly menuAccess = inject(MenuAccessService);

  protected readonly item = computed(() => this.menuAccess.navItemFor(`/legacy/${this.menuId()}`));

  /**
   * The legacy screens this destination absorbed. For a folded module that is its child
   * screens; naming them is how someone recognises that "BRD Schemes" lives behind "FSD
   * Bulk Schemes" rather than having disappeared.
   */
  protected readonly coveredScreens = computed(() => {
    const item = this.item();
    if (!item) {
      return [];
    }
    return item.aliases.filter((alias) => alias !== item.label);
  });
}
