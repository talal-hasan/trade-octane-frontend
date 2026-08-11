import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { NotificationService } from '../../../core/services/notification.service';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { CellTemplateDirective } from '../../../shared/components/data-table/cell-template.directive';
import {
  DataTableColumn,
  DataTableComponent,
} from '../../../shared/components/data-table/data-table.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { FilterBarComponent, FilterChip } from '../../../shared/components/filter-bar/filter-bar.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { BudgetRecord, BudgetStatus } from '../models/budget.model';
import { BudgetService } from '../services/budget.service';

interface SelectOption {
  label: string;
  value: string;
}

const STATUS_OPTIONS: { label: string; value: BudgetStatus }[] = [
  { label: 'Draft', value: 'draft' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Overdue', value: 'overdue' },
];

const PAGE_SIZE = 10;

// Budget list — analysis mode (CLAUDE.md §7): dense table, filter panel, sort/paginate.
// The mock data is client-side, so filtering / sorting / paging happen here and the shared
// to-data-table renders the current page (it's a pure display layer, CLAUDE.md §9).
@Component({
  selector: 'to-budget-list',
  standalone: true,
  imports: [
    FormsModule,
    TablerIconComponent,
    ButtonModule,
    SelectModule,
    TooltipModule,
    PageHeaderComponent,
    FilterBarComponent,
    DataTableComponent,
    CellTemplateDirective,
    StatusPillComponent,
    EmptyStateComponent,
  ],
  templateUrl: './budget-list.component.html',
  styleUrl: './budget-list.component.scss',
})
export class BudgetListComponent {
  private readonly budgetService = inject(BudgetService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusOptions = STATUS_OPTIONS;

  protected readonly records = signal<BudgetRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  // Filters
  protected readonly yearFilter = signal<string | null>(null);
  protected readonly regionFilter = signal<string | null>(null);
  protected readonly brandFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<string | null>(null);

  // Sort + page
  protected readonly sortColumn = signal<string | null>(null);
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly page = signal(0);

  protected readonly columns: DataTableColumn[] = [
    { key: 'id', header: 'Budget ID', sortable: true, width: '150px' },
    { key: 'year', header: 'Year', sortable: true, width: '84px' },
    { key: 'region', header: 'Region', sortable: true },
    { key: 'businessUnit', header: 'Business Unit', sortable: true },
    { key: 'brand', header: 'Brand', sortable: true },
    { key: 'masterSku', header: 'Master SKU' },
    { key: 'amount', header: 'Amount', type: 'currency', sortable: true, width: '160px' },
    { key: 'status', header: 'Status', width: '132px' },
    { key: 'actions', header: '', width: '64px' },
  ];

  // Distinct filter option lists derived from the loaded data.
  protected readonly yearOptions = computed<SelectOption[]>(() =>
    this.distinct((record) => String(record.year)).sort((a, b) => b.localeCompare(a)).map(toOption),
  );
  protected readonly regionOptions = computed<SelectOption[]>(() =>
    this.distinct((record) => record.region).sort().map(toOption),
  );
  protected readonly brandOptions = computed<SelectOption[]>(() =>
    this.distinct((record) => record.brand).sort().map(toOption),
  );

  protected readonly filteredRecords = computed<BudgetRecord[]>(() => {
    const year = this.yearFilter();
    const region = this.regionFilter();
    const brand = this.brandFilter();
    const status = this.statusFilter();
    return this.records().filter(
      (record) =>
        (!year || String(record.year) === year) &&
        (!region || record.region === region) &&
        (!brand || record.brand === brand) &&
        (!status || record.status === status),
    );
  });

  private readonly sortedRecords = computed<BudgetRecord[]>(() => {
    const column = this.sortColumn();
    const records = [...this.filteredRecords()];
    if (!column) {
      return records;
    }
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return records.sort((a, b) => {
      const left = a[column as keyof BudgetRecord];
      const right = b[column as keyof BudgetRecord];
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right)) * direction;
    });
  });

  protected readonly totalRecords = computed(() => this.filteredRecords().length);

  // The page slice handed to the (lazy) data table.
  protected readonly pagedRecords = computed<BudgetRecord[]>(() => {
    const start = this.page() * PAGE_SIZE;
    return this.sortedRecords().slice(start, start + PAGE_SIZE);
  });

  protected readonly activeChips = computed<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (this.yearFilter()) {
      chips.push({ key: 'year', label: 'Year', value: this.yearFilter()! });
    }
    if (this.regionFilter()) {
      chips.push({ key: 'region', label: 'Region', value: this.regionFilter()! });
    }
    if (this.brandFilter()) {
      chips.push({ key: 'brand', label: 'Brand', value: this.brandFilter()! });
    }
    if (this.statusFilter()) {
      chips.push({ key: 'status', label: 'Status', value: this.statusLabel(this.statusFilter()!) });
    }
    return chips;
  });

  constructor() {
    this.load();
  }

  protected budgetStatusOf(row: unknown): BudgetStatus {
    return (row as BudgetRecord).status;
  }

  protected onYearChange(value: string | null): void {
    this.yearFilter.set(value);
    this.page.set(0);
  }

  protected onRegionChange(value: string | null): void {
    this.regionFilter.set(value);
    this.page.set(0);
  }

  protected onBrandChange(value: string | null): void {
    this.brandFilter.set(value);
    this.page.set(0);
  }

  protected onStatusChange(value: string | null): void {
    this.statusFilter.set(value);
    this.page.set(0);
  }

  protected onChipRemoved(key: string): void {
    this.setFilter(key, null);
    this.page.set(0);
  }

  protected onClearAll(): void {
    this.yearFilter.set(null);
    this.regionFilter.set(null);
    this.brandFilter.set(null);
    this.statusFilter.set(null);
    this.page.set(0);
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
  }

  protected onSortChange(event: { column: string; direction: 'asc' | 'desc' }): void {
    this.sortColumn.set(event.column);
    this.sortDirection.set(event.direction);
    this.page.set(0);
  }

  protected onView(row: unknown): void {
    const record = row as BudgetRecord;
    // Placeholder until the budget detail screen lands (Phase 1 priority #5).
    this.notificationService.info(`${record.id} — detail screen arrives next.`, 'Open budget');
  }

  protected onExport(format: 'excel' | 'csv' | 'pdf'): void {
    this.notificationService.info(`Export to ${format.toUpperCase()} will be wired to the API.`);
  }

  protected retry(): void {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.budgetService
      .getBudgets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (records) => {
          this.records.set(records);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  private setFilter(key: string, value: string | null): void {
    switch (key) {
      case 'year':
        this.yearFilter.set(value);
        break;
      case 'region':
        this.regionFilter.set(value);
        break;
      case 'brand':
        this.brandFilter.set(value);
        break;
      case 'status':
        this.statusFilter.set(value);
        break;
    }
  }

  private statusLabel(value: string): string {
    return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
  }

  private distinct(pick: (record: BudgetRecord) => string): string[] {
    return Array.from(new Set(this.records().map(pick)));
  }
}

function toOption(value: string): SelectOption {
  return { label: value, value };
}
