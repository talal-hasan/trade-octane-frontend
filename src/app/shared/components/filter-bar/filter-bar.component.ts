import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { SelectModule } from 'primeng/select';

import { ICON_REGISTRY } from '../../icon-registry';

export interface FilterChip {
  key: string;
  label: string;
  value: string;
}

export interface FilterPreset {
  label: string;
  id: string;
}

// Chip-based active filters with clear-all and saved presets. Sits above data tables in
// Analysis-mode screens (CLAUDE.md §7). Filter controls themselves are screen-specific and
// supplied by the caller via the [filters] content slot.
@Component({
  selector: 'to-filter-bar',
  standalone: true,
  imports: [TablerIconComponent, SelectModule, FormsModule],
  templateUrl: './filter-bar.component.html',
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent {
  readonly chips = input<FilterChip[]>([]);
  readonly chipRemoved = output<string>();
  readonly clearAll = output<void>();

  readonly presets = input<FilterPreset[]>([]);
  readonly presetSelected = output<string>();

  protected readonly icons = ICON_REGISTRY;

  // Presets dropdown is a one-shot action trigger, not a persisted selection — reset back to
  // null after firing so the same preset can be picked again later.
  protected readonly selectedPresetId = signal<string | null>(null);

  protected onPresetChange(id: string | null): void {
    if (!id) {
      return;
    }
    this.presetSelected.emit(id);
    this.selectedPresetId.set(null);
  }
}
