import { Component, computed, inject, viewChild, ViewEncapsulation } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { AvatarModule } from 'primeng/avatar';
import { MenuModule } from 'primeng/menu';
import { MenuItem } from 'primeng/api';
import { Popover, PopoverModule } from 'primeng/popover';
import { ScrollTopModule } from 'primeng/scrolltop';
import { ToastModule } from 'primeng/toast';

import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { TooltipModule } from 'primeng/tooltip';
import { TourComponent } from '../../shared/components/tour/tour.component';
import { TourService } from '../../core/services/tour.service';
import { tourForRoute } from '../../core/tours/tour-registry';
import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { DensityService } from '../../core/services/density.service';
import { SidebarService } from '../../core/services/sidebar.service';
import { ThemeService } from '../../core/services/theme.service';
import { ICON_REGISTRY } from '../../shared/icon-registry';
import { CommandPaletteComponent } from '../command-palette/command-palette.component';
import { RoleSwitcherComponent } from '../role-switcher/role-switcher.component';
import { SidebarComponent } from '../sidebar/sidebar.component';

@Component({
  selector: 'to-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    SidebarComponent,
    CommandPaletteComponent,
    RoleSwitcherComponent,
    TablerIconComponent,
    AvatarModule,
    MenuModule,
    PopoverModule,
    ScrollTopModule,
    ToastModule,
    TourComponent,
    TooltipModule,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class ShellComponent {
  protected readonly tourService = inject(TourService);
  private readonly shellDestroyRef = inject(DestroyRef);

  constructor() {
    // One place decides which walkthrough a screen offers, so no feature component imports
    // the tour service. Ownership overrides this per tab because it hosts two flows.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.shellDestroyRef),
      )
      .subscribe((event) => this.tourService.setOfferedTour(tourForRoute(event.urlAfterRedirects)));
  }

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly densityService = inject(DensityService);
  protected readonly sidebarService = inject(SidebarService);

  protected readonly icons = ICON_REGISTRY;
  protected readonly useMocks = environment.useMocks;
  protected readonly theme = this.themeService.theme;
  protected readonly density = this.densityService.density;
  protected readonly commandPalette = viewChild.required(CommandPaletteComponent);
  protected readonly notificationsPanel = viewChild<Popover>('notificationsPanel');

  protected readonly userInitials = computed(() => {
    const name = this.authService.currentUser().name;
    return name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  });

  protected readonly userMenuItems: MenuItem[] = [
    {
      label: 'Compact density',
      icon: 'pi pi-list',
      command: () => this.densityService.toggle(),
    },
    { separator: true },
    {
      label: 'Sign out',
      icon: 'pi pi-sign-out',
      command: () => this.logout(),
    },
  ];

  openCommandPalette(): void {
    this.commandPalette().open();
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }

  toggleNotifications(event: Event): void {
    this.notificationsPanel()?.toggle(event);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
