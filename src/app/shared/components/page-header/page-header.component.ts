import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../icon-registry';

export interface PageBreadcrumb {
  label: string;
  route?: string;
}

// Title + breadcrumb + action slot, used at the top of every feature screen below the
// shell's top bar (CLAUDE.md §6 Content Area: breadcrumb row, then title left / actions right).
@Component({
  selector: 'to-page-header',
  standalone: true,
  imports: [RouterLink, TablerIconComponent],
  templateUrl: './page-header.component.html',
  styleUrl: './page-header.component.scss',
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly breadcrumbs = input<PageBreadcrumb[]>([]);

  protected readonly icons = ICON_REGISTRY;
}
