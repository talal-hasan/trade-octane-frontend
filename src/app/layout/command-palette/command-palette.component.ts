import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { DialogModule } from 'primeng/dialog';

import { NAV_SECTIONS, NavItem } from '../../core/models/nav-item.model';
import { PermissionService } from '../../core/services/permission.service';
import { ICON_REGISTRY } from '../../shared/icon-registry';

@Component({
  selector: 'to-command-palette',
  standalone: true,
  imports: [DialogModule, TablerIconComponent],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
})
export class CommandPaletteComponent {
  private readonly router = inject(Router);
  private readonly permissionService = inject(PermissionService);

  protected readonly icons = ICON_REGISTRY;
  protected readonly visible = signal(false);
  protected readonly query = signal('');
  protected readonly activeIndex = signal(0);
  protected readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  private readonly allItems = computed<NavItem[]>(() => {
    const canAccess = (item: NavItem) =>
      !item.requiredPermission || this.permissionService.canAccess(item.requiredPermission);
    return NAV_SECTIONS.flatMap((section) => section.items).filter(canAccess);
  });

  protected readonly results = computed<NavItem[]>(() => {
    const query = this.query().trim().toLowerCase();
    const items = this.allItems();
    if (!query) {
      return items;
    }
    return items.filter((item) => item.label.toLowerCase().includes(query));
  });

  @HostListener('document:keydown', ['$event'])
  handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.open();
    }
  }

  open(): void {
    this.query.set('');
    this.activeIndex.set(0);
    this.visible.set(true);
    queueMicrotask(() => this.searchInput()?.nativeElement.focus());
  }

  close(): void {
    this.visible.set(false);
  }

  select(item: NavItem): void {
    this.router.navigateByUrl(item.route);
    this.close();
  }

  onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  setActive(index: number): void {
    this.activeIndex.set(index);
  }

  onResultsKeydown(event: KeyboardEvent): void {
    const count = this.results().length;
    if (count === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set((this.activeIndex() - 1 + count) % count);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = this.results()[this.activeIndex()];
      if (item) {
        this.select(item);
      }
    }
  }
}
