import { Component, computed, input } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../icon-registry';

// Icon + heading + description + optional projected action. Used anywhere a screen would
// otherwise show a blank panel — no results, no data yet, filtered-to-nothing (CLAUDE.md §9).
@Component({
  selector: 'to-empty-state',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './empty-state.component.html',
  styleUrl: './empty-state.component.scss',
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly heading = input.required<string>();
  readonly description = input<string>();

  protected readonly iconData = computed(() => ICON_REGISTRY[this.icon()] ?? ICON_REGISTRY['inbox']);
}
