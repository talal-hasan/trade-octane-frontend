import { Component, computed, input } from '@angular/core';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

// Loading placeholder that approximates the shape of the content it stands in for
// (CLAUDE.md §9). `count` renders N stacked blocks for table-row/list placeholders.
@Component({
  selector: 'to-skeleton',
  standalone: true,
  templateUrl: './skeleton.component.html',
  styleUrl: './skeleton.component.scss',
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('text');
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly count = input<number>(1);

  protected readonly blocks = computed(() => Array.from({ length: Math.max(1, this.count()) }));

  // Circle skeletons (avatars) need equal width/height — derive height from width so
  // callers only pass one dimension instead of duplicating it.
  protected readonly blockHeight = computed(() =>
    this.variant() === 'circle' ? this.width() : this.height(),
  );
}
