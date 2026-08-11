import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TooltipModule } from 'primeng/tooltip';

import { PermissionService } from '../../core/services/permission.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { NAV_SECTIONS, NavItem } from '../../core/models/nav-item.model';
import { ICON_REGISTRY } from '../../shared/icon-registry';

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

  private readonly permissionService = inject(PermissionService);

  protected readonly sections = computed(() => {
    const canAccess = (item: NavItem) =>
      !item.requiredPermission || this.permissionService.canAccess(item.requiredPermission);

    return NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(canAccess),
    })).filter((section) => section.items.length > 0);
  });

  toggle(): void {
    this.sidebarService.toggle();
  }
}
