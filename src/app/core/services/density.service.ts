import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'to-density';
export type Density = 'comfortable' | 'compact';

// Drives [data-density="compact"] on <html> (CLAUDE.md §5 Density). MIS and
// Finance users are expected to live in compact mode.
@Injectable({ providedIn: 'root' })
export class DensityService {
  readonly density = signal<Density>((localStorage.getItem(STORAGE_KEY) as Density) ?? 'comfortable');

  constructor() {
    effect(() => {
      const density = this.density();
      if (density === 'compact') {
        document.documentElement.setAttribute('data-density', 'compact');
      } else {
        document.documentElement.removeAttribute('data-density');
      }
      localStorage.setItem(STORAGE_KEY, density);
    });
  }

  toggle(): void {
    this.density.update((current) => (current === 'comfortable' ? 'compact' : 'comfortable'));
  }
}
