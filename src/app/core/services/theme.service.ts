import { Injectable, effect, signal } from '@angular/core';

const STORAGE_KEY = 'to-theme';
export type Theme = 'light' | 'dark';

// Drives [data-theme="dark"] on <html> (CLAUDE.md §5 Dark mode). Zero
// component-level dark mode logic — components only ever read CSS tokens.
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) ?? 'light');

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(STORAGE_KEY, theme);
    });
  }

  toggle(): void {
    this.theme.update((current) => (current === 'light' ? 'dark' : 'light'));
  }
}
