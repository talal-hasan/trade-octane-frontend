import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';

export interface CascadeLevel {
  key: string;
  label: string;
  options: { label: string; value: string }[];
}

// Year → Region → Business Unit → Category → Brand → Master SKU pattern (CLAUDE.md §8 Budget
// Initiation cascade). Dumb renderer + value holder: the parent screen owns the actual
// filtering logic (via mock/real services) and re-derives `levels`/`values` on each change.
//
// Saveable presets are deferred to Phase 1 — they need a backing preset-storage service that
// doesn't exist yet, so no preset UI is built here.
@Component({
  selector: 'to-cascading-select',
  standalone: true,
  imports: [SelectModule, FormsModule],
  templateUrl: './cascading-select.component.html',
  styleUrl: './cascading-select.component.scss',
})
export class CascadingSelectComponent {
  readonly levels = input.required<CascadeLevel[]>();
  readonly values = input<Record<string, string | null>>({});
  readonly valueChange = output<{ key: string; value: string | null }>();

  protected valueFor(key: string): string | null {
    return this.values()[key] ?? null;
  }

  // A level is disabled until every level before it has a non-null value — enforces the
  // one-to-one progressive-disclosure mapping required by the cascade.
  protected isDisabled(index: number): boolean {
    const levels = this.levels();
    for (let i = 0; i < index; i++) {
      if (this.valueFor(levels[i].key) == null) {
        return true;
      }
    }
    return false;
  }

  protected onLevelChange(index: number, value: string | null): void {
    const levels = this.levels();
    this.valueChange.emit({ key: levels[index].key, value });

    // Selecting a level invalidates everything downstream of it — emit an explicit clear
    // for each subsequent level so the caller never has to infer this itself.
    for (let i = index + 1; i < levels.length; i++) {
      this.valueChange.emit({ key: levels[i].key, value: null });
    }
  }
}
