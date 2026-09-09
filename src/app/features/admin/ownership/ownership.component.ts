import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MenuAccessService } from '../../../core/services/menu-access.service';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ActivityOwnershipComponent } from './activity-ownership/activity-ownership.component';
import { BudgetOwnershipComponent } from './budget-ownership/budget-ownership.component';

type OwnershipTab = 'budget' | 'activity';

/**
 * Ownership Transfers — the folded home of two legacy menu rows, "Change Budget Ownership"
 * (menuId 225) and "Change Activity Ownership" (226).
 *
 * They are the same task on two record types: find work stranded with someone who can no
 * longer act on it, and hand it to someone who can. Two tabs rather than two screens, and
 * as with the Users screen a tab only renders if its legacy menu row was granted.
 */
@Component({
  selector: 'to-ownership',
  standalone: true,
  imports: [
    PageHeaderComponent,
    EmptyStateComponent,
    BudgetOwnershipComponent,
    ActivityOwnershipComponent,
  ],
  templateUrl: './ownership.component.html',
  styleUrl: './ownership.component.scss',
})
export class OwnershipComponent {
  private readonly menuAccess = inject(MenuAccessService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly tabLabels: Record<OwnershipTab, string> = {
    budget: 'Budget ownership',
    activity: 'Activity ownership',
  };

  /** Only the tabs whose legacy menu row this admin holds. */
  protected readonly availableTabs = computed<OwnershipTab[]>(() => {
    const granted = new Set(this.menuAccess.tabsFor('/admin/ownership'));
    return (['budget', 'activity'] as OwnershipTab[]).filter((tab) => granted.has(tab));
  });

  private readonly requested = signal<OwnershipTab | null>(
    this.route.snapshot.queryParamMap.get('tab') as OwnershipTab | null,
  );

  protected readonly activeTab = computed<OwnershipTab | null>(() => {
    const tabs = this.availableTabs();
    const requested = this.requested();
    return requested && tabs.includes(requested) ? requested : (tabs[0] ?? null);
  });

  protected select(tab: OwnershipTab): void {
    this.requested.set(tab);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      replaceUrl: true,
    });
  }
}
