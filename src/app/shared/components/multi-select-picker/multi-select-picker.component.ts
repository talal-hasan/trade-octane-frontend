import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DOCUMENT } from '@angular/common';
import { TablerIconComponent } from '@tabler/icons-angular';
import { InputTextModule } from 'primeng/inputtext';
import { fromEvent } from 'rxjs';

import { ICON_REGISTRY } from '../../icon-registry';

export interface PickerOption {
  value: string;
  label: string;
  /** Secondary line — a code, or what the option contains. */
  hint?: string;
  /** Trailing figure, e.g. how many records sit behind this option. */
  count?: number | string;
}

/**
 * A searchable multi-select over a long option list.
 *
 * Built because the ownership screens rendered their filters as chipsets, and one of those
 * lists has ~60 scheme types. A chipset is right for 3–12 mutually visible options; past
 * that it stops being a control and becomes a wall — on Budget Ownership it occupied over
 * half the viewport and pushed the actual work below the fold.
 *
 * The trigger collapses to a summary ("3 selected", or the single label when only one is),
 * so the filter row stays one line tall regardless of catalogue size.
 *
 * **Select all acts on what is visible**, matching the rule used elsewhere in
 * Administration: a button sitting above six filtered options must not silently select the
 * other fifty-four. It says "shown" while a search is active so the scope is never implied.
 */
@Component({
  selector: 'to-multi-select-picker',
  standalone: true,
  imports: [TablerIconComponent, InputTextModule],
  templateUrl: './multi-select-picker.component.html',
  styleUrl: './multi-select-picker.component.scss',
})
export class MultiSelectPickerComponent {
  readonly label = input.required<string>();
  readonly options = input.required<readonly PickerOption[]>();
  readonly selected = input.required<ReadonlySet<string>>();
  /** What an empty selection means. Usually "All" — no filter rather than no results. */
  readonly emptyLabel = input('All');
  readonly searchPlaceholder = input('Search');
  readonly disabled = input(false);
  /**
   * One-of rather than many-of. Picking replaces the selection and closes the panel;
   * picking the current value clears it, so "no filter" stays reachable without a
   * separate control.
   */
  readonly single = input(false);

  readonly changed = output<ReadonlySet<string>>();

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly open = signal(false);
  protected readonly search = signal('');

  constructor() {
    // Close on an outside click. Registered once rather than per-open so there is no
    // listener to leak if the component is destroyed while the panel is showing.
    fromEvent<MouseEvent>(this.document, 'mousedown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (!this.open()) {
          return;
        }
        const target = event.target as Node | null;
        if (target && !this.host.nativeElement.contains(target)) {
          this.open.set(false);
        }
      });

    fromEvent<KeyboardEvent>(this.document, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.key === 'Escape' && this.open()) {
          this.open.set(false);
        }
      });
  }

  protected toggleOpen(): void {
    if (this.disabled()) {
      return;
    }
    this.open.update((value) => !value);
    if (!this.open()) {
      this.search.set('');
    }
  }

  protected onSearch(value: string): void {
    this.search.set(value);
  }

  protected readonly visible = computed<readonly PickerOption[]>(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) {
      return this.options();
    }
    return this.options().filter(
      (option) =>
        option.label.toLowerCase().includes(term) ||
        (option.hint ?? '').toLowerCase().includes(term) ||
        option.value.toLowerCase().includes(term),
    );
  });

  /**
   * The trigger's text. Names the single selection rather than saying "1 selected" — the
   * label is more useful than the count when there is only one, and it saves opening the
   * panel to remember what you picked.
   */
  protected readonly summary = computed(() => {
    const selected = this.selected();
    if (selected.size === 0) {
      return this.emptyLabel();
    }
    if (selected.size === 1) {
      const [only] = selected;
      return this.options().find((option) => option.value === only)?.label ?? only;
    }
    return `${selected.size} selected`;
  });

  protected readonly allVisibleSelected = computed(() => {
    const visible = this.visible();
    const selected = this.selected();
    return visible.length > 0 && visible.every((option) => selected.has(option.value));
  });

  protected isSelected(value: string): boolean {
    return this.selected().has(value);
  }

  protected toggle(value: string): void {
    if (this.single()) {
      const isCurrent = this.selected().has(value);
      this.changed.emit(isCurrent ? new Set<string>() : new Set([value]));
      this.open.set(false);
      this.search.set('');
      return;
    }
    const next = new Set(this.selected());
    if (!next.delete(value)) {
      next.add(value);
    }
    this.changed.emit(next);
  }

  /** Adds or removes the *visible* options, leaving anything filtered out untouched. */
  protected toggleAllVisible(): void {
    const selectAll = !this.allVisibleSelected();
    const next = new Set(this.selected());
    for (const option of this.visible()) {
      if (selectAll) {
        next.add(option.value);
      } else {
        next.delete(option.value);
      }
    }
    this.changed.emit(next);
  }

  /** Clears everything, including options hidden by the current search. */
  protected clearAll(): void {
    this.changed.emit(new Set<string>());
  }
}
