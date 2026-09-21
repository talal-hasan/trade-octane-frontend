import { Component, computed, inject, input, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { HasUnsavedChanges } from '../../../core/guards/unsaved-changes.guard';
import { MenuAccessService } from '../../../core/services/menu-access.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { MappingEditorComponent, MappingView } from './mapping-editor/mapping-editor.component';
import { RegionRolesComponent } from './region-roles/region-roles.component';
import { USER_MAPPING_ROUTE, USER_MAPPING_TAB_ACCESS, USER_MAPPING_TAB_MAPPING } from './user-mapping.util';

type UserMappingTab = 'users' | 'regions';

/**
 * User Mapping — Administration 2.0, legacy `CPS_User_Mapping.aspx` (menuId 91).
 *
 * Two tabs over one subject, as Ownership Transfers does:
 *
 * - **Map a user** — one role, and any number of business types, regions and areas, for one
 *   Promo_Management_2 account. What the legacy page was.
 * - **Roles by region** — how many accounts hold each role in each region, with every count
 *   opening the accounts behind it. The client asked for this; legacy had no such view.
 *
 * The tab, the account and its view live in the query string (`?tab=regions`, `?user=<login>`,
 * `?view=access`), so a mapping can be linked to and the back button behaves. The tours
 * resolve from the same query string — see `tourForRoute`.
 *
 * **Menu access** (`view=access`) is legacy Administration 2.0 → Access Control (menuId 97):
 * one account's Octane 2 screens, from its role and granted directly. It shares the account
 * list, so it is a view of the selected account rather than a screen of its own. The legacy
 * rows are the destination's tabs — `mapping` (91) and `access` (97) — and each view shows
 * only to holders of its row.
 */
@Component({
  selector: 'to-admin2-user-mapping',
  standalone: true,
  imports: [PageHeaderComponent, MappingEditorComponent, RegionRolesComponent],
  templateUrl: './user-mapping.component.html',
  styleUrl: './user-mapping.component.scss',
})
export class UserMappingComponent implements HasUnsavedChanges {
  /** Query parameters, bound via `withComponentInputBinding()`. */
  readonly tab = input<string | undefined>(undefined);
  readonly user = input<string | undefined>(undefined);
  readonly view = input<string | undefined>(undefined);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly editor = viewChild(MappingEditorComponent);
  private readonly menuAccess = inject(MenuAccessService);

  private readonly heldTabs = computed(() => this.menuAccess.tabsFor(USER_MAPPING_ROUTE));
  protected readonly canMap = computed(() => this.heldTabs().includes(USER_MAPPING_TAB_MAPPING));
  protected readonly canAccess = computed(() => this.heldTabs().includes(USER_MAPPING_TAB_ACCESS));

  /** Roles by region is part of User Mapping (91), so a holder of only Access Control does not see it. */
  protected readonly tabs = computed<{ key: UserMappingTab; label: string }[]>(() => [
    { key: 'users', label: this.canMap() ? 'Map a user' : 'Accounts' },
    ...(this.canMap() ? [{ key: 'regions' as const, label: 'Roles by region' }] : []),
  ]);

  protected readonly activeTab = computed<UserMappingTab>(() =>
    this.tab() === 'regions' && this.canMap() ? 'regions' : 'users',
  );
  protected readonly userId = computed(() => this.user() || null);

  protected readonly activeView = computed<MappingView>(() => {
    if (this.view() === 'access' && this.canAccess()) {
      return 'access';
    }
    return this.canMap() ? 'mapping' : 'access';
  });

  hasUnsavedChanges(): boolean {
    return this.editor()?.hasUnsavedChanges() ?? false;
  }

  protected selectTab(tab: UserMappingTab): void {
    if (tab === this.activeTab()) {
      return;
    }
    if (this.hasUnsavedChanges() && !confirm('You have unsaved changes to this mapping. Discard them?')) {
      return;
    }
    this.navigate({ tab: tab === 'regions' ? 'regions' : null });
  }

  protected selectUser(userId: string): void {
    this.navigate({ user: userId });
  }

  protected selectView(view: MappingView): void {
    this.navigate({ view: view === 'access' ? 'access' : null });
  }

  /** From a count on Roles by region, straight to that account's mapping. */
  protected openUser(userId: string): void {
    this.navigate({ tab: null, user: userId, view: null });
  }

  private navigate(queryParams: Record<string, string | null>): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
