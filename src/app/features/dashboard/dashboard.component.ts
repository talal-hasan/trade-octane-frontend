import { Component, computed, inject } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { AuthService } from '../../core/services/auth.service';
import { ICON_REGISTRY } from '../../shared/icon-registry';

interface UpcomingWidget {
  icon: string;
  title: string;
  description: string;
}

// Placeholder — full dashboard/approvals inbox is Phase 1 priority #2.
@Component({
  selector: 'to-dashboard',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
  protected readonly icons = ICON_REGISTRY;

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly upcomingWidgets: UpcomingWidget[] = [
    {
      icon: 'inbox',
      title: 'Approvals inbox',
      description: 'Every pending budget, scheme and claim decision in one queue.',
    },
    {
      icon: 'wallet',
      title: 'Budget headroom',
      description: 'Live consumed vs. remaining budget by region, brand and SKU.',
    },
    {
      icon: 'discount-2',
      title: 'Scheme expirations',
      description: 'Upcoming BRD and Trade Offer expiries that need attention.',
    },
    {
      icon: 'refresh',
      title: 'SAP sync alerts',
      description: 'Master data changes from SAP affecting live budgets.',
    },
  ];
}
