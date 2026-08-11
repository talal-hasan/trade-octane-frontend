import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'to-sidebar-collapsed';

// Shared collapsed state — toggled from both the top bar hamburger and the
// sidebar's own bottom collapse button (CLAUDE.md §6).
@Injectable({ providedIn: 'root' })
export class SidebarService {
  readonly collapsed = signal(localStorage.getItem(STORAGE_KEY) === 'true');

  constructor() {
    effect(() => {
      localStorage.setItem(STORAGE_KEY, String(this.collapsed()));
    });
  }

  toggle(): void {
    this.collapsed.update((value) => !value);
  }
}
