import { Component, computed, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import type { MenuItem } from 'primeng/api';
import { ContextMenuModule } from 'primeng/contextmenu';
import { MultiSelectModule } from 'primeng/multiselect';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TableModule } from 'primeng/table';
import type { TablePageEvent } from 'primeng/table';

import { FormatService } from '../../../core/services/format.service';
import { ICON_REGISTRY } from '../../icon-registry';
import { PkrCurrencyPipe } from '../../pipes/pkr-currency.pipe';

export type DataTableColumnType = 'text' | 'number' | 'currency' | 'date' | 'status';

// T carries no field references today, but keeps the door open for callers to
// declare `DataTableColumn<Scheme>[]` etc. once row typing is worth the ceremony.
// Spec text said `T = any` — CLAUDE.md §3 bans `any` outright, so this uses `unknown`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future typed use, see above
export interface DataTableColumn<T = unknown> {
  key: string;
  header: string;
  type?: DataTableColumnType;
  sortable?: boolean;
  width?: string;
}

export interface DataTableSavedView {
  label: string;
  id: string;
}

interface DataTableSortIntent {
  field?: string;
  order?: number;
}

const NUMERIC_COLUMN_TYPES: ReadonlySet<DataTableColumnType> = new Set(['number', 'currency']);

// Server-side-paginated, virtual-scroll-capable data table built on PrimeNG's p-table
// (CLAUDE.md §9). Pure display + interaction layer — it never fetches or sorts data
// itself; the parent screen owns the query and re-supplies `rows`/`totalRecords`.
@Component({
  selector: 'to-data-table',
  standalone: true,
  imports: [
    TableModule,
    MultiSelectModule,
    ContextMenuModule,
    SplitButtonModule,
    ReactiveFormsModule,
    TablerIconComponent,
    PkrCurrencyPipe,
  ],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent {
  readonly columns = input.required<DataTableColumn[]>();
  readonly rows = input.required<unknown[]>();
  readonly loading = input<boolean>(false);
  readonly totalRecords = input<number>(0);
  readonly pageSize = input<number>(20);
  readonly page = input<number>(0);
  readonly selectable = input<boolean>(false);
  readonly contextMenuItems = input<MenuItem[]>([]);
  readonly savedViews = input<DataTableSavedView[]>([]);
  readonly stickyFirstColumn = input<boolean>(true);
  readonly virtualScroll = input<boolean>(false);

  // PrimeNG's virtual scroller needs a fixed JS pixel number — it can't read the
  // --to-row-height CSS custom property at layout time. 44 splits the difference
  // between comfortable (48px) and compact (36px) density; override per-screen if a
  // caller knows which density their users live in.
  readonly virtualScrollItemSize = input<number>(44);

  readonly pageChange = output<number>();
  readonly selectionChange = output<unknown[]>();
  readonly sortChange = output<{ column: string; direction: 'asc' | 'desc' }>();
  readonly exportRequested = output<'excel' | 'csv' | 'pdf'>();
  readonly viewSelected = output<string>();

  private readonly formatService = inject(FormatService);

  // "Hide columns" rather than "show columns" — default (empty control value) means
  // every column is visible, so there's no init-order dependency on `columns()` being
  // populated yet. Reactive Forms per CLAUDE.md §3, even for this local UI-only toggle.
  protected readonly hiddenColumnsControl = new FormControl<string[]>([], { nonNullable: true });
  private readonly hiddenColumnKeysList = toSignal(this.hiddenColumnsControl.valueChanges, {
    initialValue: [] as string[],
  });

  protected readonly selection = signal<unknown[]>([]);

  protected readonly columnOptions = computed(() =>
    this.columns().map((column) => ({ label: column.header, value: column.key })),
  );

  protected readonly visibleColumns = computed(() => {
    const hidden = new Set(this.hiddenColumnKeysList());
    return this.columns().filter((column) => !hidden.has(column.key));
  });

  protected readonly emptyIcon = ICON_REGISTRY['inbox'];

  // Main split-button action exports the most commonly requested format; the dropdown
  // covers the rest — matches the Stripe/Linear pattern of "primary action + overflow".
  protected readonly exportMenuItems: MenuItem[] = [
    { label: 'CSV', command: () => this.exportRequested.emit('csv') },
    { label: 'PDF', command: () => this.exportRequested.emit('pdf') },
  ];

  protected isNumericColumn(column: DataTableColumn): boolean {
    return NUMERIC_COLUMN_TYPES.has(column.type ?? 'text');
  }

  protected getCellValue(row: unknown, column: DataTableColumn): unknown {
    if (row && typeof row === 'object') {
      return (row as Record<string, unknown>)[column.key];
    }
    return undefined;
  }

  protected getNumericValue(row: unknown, column: DataTableColumn): number | null {
    const value = this.getCellValue(row, column);
    return typeof value === 'number' && !Number.isNaN(value) ? value : null;
  }

  protected formatNumberValue(value: number | null): string {
    return value === null ? '—' : this.formatService.formatNumber(value);
  }

  protected formatDateValue(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return new Intl.DateTimeFormat('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }).format(
      date,
    );
  }

  protected handlePage(event: TablePageEvent): void {
    const rowsPerPage = event.rows > 0 ? event.rows : this.pageSize();
    const nextPage = rowsPerPage > 0 ? Math.floor(event.first / rowsPerPage) : 0;
    this.pageChange.emit(nextPage);
  }

  protected handleSort(event: DataTableSortIntent): void {
    if (!event.field) {
      return;
    }
    this.sortChange.emit({ column: event.field, direction: event.order === -1 ? 'desc' : 'asc' });
  }

  protected handleSelectionChange(value: unknown): void {
    const next = Array.isArray(value) ? value : [];
    this.selection.set(next);
    this.selectionChange.emit(next);
  }

  // Deterministic-length placeholder set for the loading state — count, not identity,
  // is all @for needs since these rows are never interactive.
  protected readonly skeletonRowIndexes = computed(() =>
    Array.from({ length: 8 }, (_, i) => i),
  );
}
