import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/services/auth.service';

// Placeholder — full dashboard/approvals inbox is Phase 1 priority #2.
@Component({
  selector: 'to-dashboard',
  standalone: true,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
}
