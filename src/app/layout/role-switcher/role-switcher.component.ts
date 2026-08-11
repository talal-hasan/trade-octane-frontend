import { Component, inject, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TablerIconComponent } from '@tabler/icons-angular';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { ROLE_LABELS, Role } from '../../core/models/role.model';
import { ICON_REGISTRY } from '../../shared/icon-registry';

@Component({
  selector: 'to-role-switcher',
  standalone: true,
  imports: [ButtonModule, TablerIconComponent],
  templateUrl: './role-switcher.component.html',
  styleUrl: './role-switcher.component.scss',
})
export class RoleSwitcherComponent {
  protected readonly useMocks = environment.useMocks;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly icons = ICON_REGISTRY;
  protected readonly expanded = signal(false);
  protected readonly authService = inject(AuthService);

  toggle(): void {
    this.expanded.update((value) => !value);
  }

  switchTo(role: Role): void {
    this.authService.loginAs(role);
    this.expanded.set(false);
  }
}
