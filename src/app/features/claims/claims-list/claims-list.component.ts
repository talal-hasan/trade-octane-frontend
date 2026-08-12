import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { NotificationService } from '../../../core/services/notification.service';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { CellTemplateDirective } from '../../../shared/components/data-table/cell-template.directive';
import {
  DataTableColumn,
  DataTableComponent,
} from '../../../shared/components/data-table/data-table.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { PipelineStageComponent } from '../../../shared/components/pipeline-stage/pipeline-stage.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import {
  CLAIM_PIPELINE_STAGES,
  ClaimRecord,
  ClaimStatus,
  ClaimType,
} from '../models/claim.model';
import { ClaimsService } from '../services/claims.service';

const TYPE_LABELS: Record<ClaimType, string> = {
  normal: 'Normal',
  delay: 'Delay',
  damage: 'Damage',
};

const PAGE_SIZE = 10;

// Claims list — analysis mode (CLAUDE.md §7). The Stage column visualises the three-stage
// VBase → Trade Spend → Pujar pipeline (§8) via to-pipeline-stage. Sort/paginate are
// client-side over mock data; to-data-table stays a pure display layer.
@Component({
  selector: 'to-claims-list',
  standalone: true,
  imports: [
    RouterLink,
    TablerIconComponent,
    ButtonModule,
    TooltipModule,
    PageHeaderComponent,
    DataTableComponent,
    CellTemplateDirective,
    PipelineStageComponent,
    StatusPillComponent,
    EmptyStateComponent,
  ],
  templateUrl: './claims-list.component.html',
  styleUrl: './claims-list.component.scss',
})
export class ClaimsListComponent {
  private readonly claimsService = inject(ClaimsService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly pageSize = PAGE_SIZE;
  protected readonly pipelineStages = [...CLAIM_PIPELINE_STAGES];
  protected readonly typeLabels = TYPE_LABELS;

  // Reactive source of truth: reads the store signal directly, so claims created elsewhere
  // (the form, the approvals inbox) appear here without a manual refetch.
  protected readonly records = this.claimsService.claims;
  protected readonly loading = signal(true);
  protected readonly error = signal(false);

  protected readonly sortColumn = signal<string | null>(null);
  protected readonly sortDirection = signal<'asc' | 'desc'>('asc');
  protected readonly page = signal(0);

  protected readonly columns: DataTableColumn[] = [
    { key: 'id', header: 'Claim ID', sortable: true, width: '150px' },
    { key: 'type', header: 'Type', sortable: true, width: '110px' },
    { key: 'region', header: 'Region', sortable: true },
    { key: 'amount', header: 'Amount', type: 'currency', sortable: true, width: '150px' },
    { key: 'stage', header: 'Stage', width: '230px' },
    { key: 'status', header: 'Status', width: '128px' },
    { key: 'raisedBy', header: 'Raised By', sortable: true },
    { key: 'actions', header: '', width: '64px' },
  ];

  private readonly sortedRecords = computed<ClaimRecord[]>(() => {
    const column = this.sortColumn();
    const records = [...this.records()];
    if (!column) {
      return records;
    }
    const direction = this.sortDirection() === 'asc' ? 1 : -1;
    return records.sort((a, b) => {
      const left = a[column as keyof ClaimRecord];
      const right = b[column as keyof ClaimRecord];
      if (typeof left === 'number' && typeof right === 'number') {
        return (left - right) * direction;
      }
      return String(left).localeCompare(String(right)) * direction;
    });
  });

  protected readonly totalRecords = computed(() => this.records().length);

  protected readonly pagedRecords = computed<ClaimRecord[]>(() => {
    const start = this.page() * PAGE_SIZE;
    return this.sortedRecords().slice(start, start + PAGE_SIZE);
  });

  constructor() {
    this.load();
  }

  protected claimTypeOf(row: unknown): ClaimType {
    return (row as ClaimRecord).type;
  }

  protected claimStatusOf(row: unknown): ClaimStatus {
    return (row as ClaimRecord).status;
  }

  protected stageIndexOf(row: unknown): number {
    return (row as ClaimRecord).currentStageIndex;
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
    const record = row as ClaimRecord;
    // Placeholder until the claims detail screen lands (Phase 1 priority #12).
    this.notificationService.info(`${record.id} — detail screen arrives next.`, 'Open claim');
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
    // The store already holds the data; refresh() just simulates the initial fetch so the
    // skeleton shows briefly. The table reads `records` (the store signal) reactively.
    this.claimsService
      .refresh()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loading.set(false),
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }
}
