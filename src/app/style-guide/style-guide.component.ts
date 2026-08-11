import { JsonPipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';

import {
  ActivityEntry,
  ActivityTimelineComponent,
} from '../shared/components/activity-timeline/activity-timeline.component';
import {
  ApprovalChainComponent,
  ApprovalStep,
} from '../shared/components/approval-chain/approval-chain.component';
import { BulkUploadColumn, BulkUploaderComponent } from '../shared/components/bulk-uploader/bulk-uploader.component';
import {
  CascadeLevel,
  CascadingSelectComponent,
} from '../shared/components/cascading-select/cascading-select.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { DataTableColumn, DataTableComponent } from '../shared/components/data-table/data-table.component';
import { EmptyStateComponent } from '../shared/components/empty-state/empty-state.component';
import { FilterChip, FilterBarComponent, FilterPreset } from '../shared/components/filter-bar/filter-bar.component';
import { HeadroomBarComponent } from '../shared/components/headroom-bar/headroom-bar.component';
import { NumberDisplayComponent } from '../shared/components/number-display/number-display.component';
import { PageHeaderComponent } from '../shared/components/page-header/page-header.component';
import { PipelineStageComponent } from '../shared/components/pipeline-stage/pipeline-stage.component';
import { SkeletonComponent } from '../shared/components/skeleton/skeleton.component';
import { StatusPillComponent, StatusPillStatus } from '../shared/components/status-pill/status-pill.component';

interface MockBudgetRow {
  region: string;
  brand: string;
  allocated: number;
  status: string;
  updated: string;
}

// Component gallery, visible in mock mode only (CLAUDE.md §6). One live, interactive
// instance of every shared component from CLAUDE.md §9, with the exact props/events
// each component actually exposes — this page IS the reference for how to consume them.
@Component({
  selector: 'to-style-guide',
  standalone: true,
  imports: [
    JsonPipe,
    ButtonModule,
    ActivityTimelineComponent,
    ApprovalChainComponent,
    BulkUploaderComponent,
    CascadingSelectComponent,
    ConfirmDialogComponent,
    DataTableComponent,
    EmptyStateComponent,
    FilterBarComponent,
    HeadroomBarComponent,
    NumberDisplayComponent,
    PageHeaderComponent,
    PipelineStageComponent,
    SkeletonComponent,
    StatusPillComponent,
  ],
  templateUrl: './style-guide.component.html',
  styleUrl: './style-guide.component.scss',
})
export class StyleGuideComponent {
  // ─── Status Pill ──────────────────────────────────────────
  protected readonly statuses: StatusPillStatus[] = [
    'approved',
    'pending',
    'draft',
    'rejected',
    'overdue',
    'needs-attention',
  ];

  // ─── Confirm Dialog ───────────────────────────────────────
  protected readonly confirmVisible = signal(false);
  protected readonly lastConfirmAction = signal<string | null>(null);

  onConfirmed(): void {
    this.lastConfirmAction.set('Confirmed at ' + new Date().toLocaleTimeString());
  }

  onCancelled(): void {
    this.lastConfirmAction.set('Cancelled at ' + new Date().toLocaleTimeString());
  }

  // ─── Filter Bar ───────────────────────────────────────────
  protected readonly filterChips = signal<FilterChip[]>([
    { key: 'region', label: 'Region', value: 'Punjab-North' },
    { key: 'brand', label: 'Brand', value: 'Olpers' },
  ]);
  protected readonly filterPresets: FilterPreset[] = [
    { id: 'my-pending', label: 'My pending approvals' },
    { id: 'overdue', label: 'Overdue claims' },
  ];
  protected readonly lastPreset = signal<string | null>(null);

  onChipRemoved(key: string): void {
    this.filterChips.update((chips) => chips.filter((chip) => chip.key !== key));
  }

  onClearAllFilters(): void {
    this.filterChips.set([]);
  }

  onPresetSelected(id: string): void {
    this.lastPreset.set(id);
  }

  // ─── Cascading Select ─────────────────────────────────────
  protected readonly cascadeValues = signal<Record<string, string | null>>({
    year: null,
    region: null,
    brand: null,
  });

  protected readonly cascadeLevels = signal<CascadeLevel[]>([
    {
      key: 'year',
      label: 'Year',
      options: [
        { label: '2026', value: '2026' },
        { label: '2027', value: '2027' },
      ],
    },
    { key: 'region', label: 'Region', options: [] },
    { key: 'brand', label: 'Brand', options: [] },
  ]);

  private readonly regionsByYear: Record<string, { label: string; value: string }[]> = {
    2026: [
      { label: 'Punjab-North', value: 'punjab-north' },
      { label: 'Sindh', value: 'sindh' },
    ],
    2027: [{ label: 'KPK', value: 'kpk' }],
  };

  private readonly brandsByRegion: Record<string, { label: string; value: string }[]> = {
    'punjab-north': [
      { label: 'Olpers', value: 'olpers' },
      { label: 'Tarang', value: 'tarang' },
    ],
    sindh: [{ label: 'Nurpur', value: 'nurpur' }],
    kpk: [{ label: 'Olpers', value: 'olpers' }],
  };

  onCascadeChange(event: { key: string; value: string | null }): void {
    this.cascadeValues.update((values) => ({ ...values, [event.key]: event.value }));

    if (event.key === 'year') {
      this.cascadeLevels.update((levels) =>
        levels.map((level) =>
          level.key === 'region'
            ? { ...level, options: event.value ? (this.regionsByYear[event.value] ?? []) : [] }
            : level.key === 'brand'
              ? { ...level, options: [] }
              : level,
        ),
      );
    }
    if (event.key === 'region') {
      this.cascadeLevels.update((levels) =>
        levels.map((level) =>
          level.key === 'brand'
            ? { ...level, options: event.value ? (this.brandsByRegion[event.value] ?? []) : [] }
            : level,
        ),
      );
    }
  }

  // ─── Headroom Bar ─────────────────────────────────────────
  protected readonly headroomTotal = 5_000_000;
  protected readonly headroomConsumed = 3_200_000;
  protected readonly headroomPending = 900_000;
  protected readonly overrunTotal = 2_000_000;
  protected readonly overrunConsumed = 1_850_000;
  protected readonly overrunPending = 400_000;

  // ─── Pipeline Stage ───────────────────────────────────────
  protected readonly claimsStages = ['VBase', 'Trade Spend', 'Pujar'];

  // ─── Activity Timeline ────────────────────────────────────
  protected readonly activityEntries: ActivityEntry[] = [
    {
      actor: 'Ahmed Bilal',
      action: 'submitted the claim',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26),
    },
    {
      actor: 'Sara Iqbal',
      action: 'requested changes',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20),
      remarks: 'Liter column total does not match the attached invoice — please recheck row 4.',
    },
    {
      actor: 'Ahmed Bilal',
      action: 'resubmitted the claim',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
  ];

  // ─── Approval Chain ───────────────────────────────────────
  protected readonly approvalCanApprove = signal(true);
  protected readonly approvalSteps: ApprovalStep[] = [
    {
      role: 'RSM',
      name: 'Ahmed Bilal',
      status: 'approved',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 26),
      remarks: 'Looks good, within region budget.',
    },
    { role: 'Head of Sales', name: 'Farhan Malik', status: 'pending' },
    { role: 'Finance', name: 'Nida Sheikh', status: 'waiting' },
  ];
  protected readonly lastApprovalAction = signal<string | null>(null);

  onApprove(event: { stepIndex: number; remarks: string }): void {
    this.lastApprovalAction.set(`Step ${event.stepIndex} approved — "${event.remarks || '(no remarks)'}"`);
  }

  onReject(event: { stepIndex: number; remarks: string }): void {
    this.lastApprovalAction.set(`Step ${event.stepIndex} rejected — "${event.remarks}"`);
  }

  // ─── Data Table ───────────────────────────────────────────
  protected readonly dataTableLoading = signal(false);
  protected readonly dataTableColumns: DataTableColumn[] = [
    { key: 'region', header: 'Region', sortable: true },
    { key: 'brand', header: 'Brand', sortable: true },
    { key: 'allocated', header: 'Allocated', type: 'currency', sortable: true },
    { key: 'status', header: 'Status' },
    { key: 'updated', header: 'Updated', type: 'date' },
  ];
  protected readonly dataTableRows: MockBudgetRow[] = [
    { region: 'Punjab-North', brand: 'Olpers', allocated: 5_000_000, status: 'Approved', updated: '2026-08-01' },
    { region: 'Punjab-South', brand: 'Tarang', allocated: 3_250_000, status: 'Pending', updated: '2026-08-05' },
    { region: 'Sindh', brand: 'Nurpur', allocated: 1_800_000, status: 'Draft', updated: '2026-08-08' },
  ];

  toggleDataTableLoading(): void {
    this.dataTableLoading.update((value) => !value);
  }

  // ─── Bulk Uploader ────────────────────────────────────────
  protected readonly bulkUploadColumns: BulkUploadColumn[] = [
    {
      key: 'discount',
      header: 'Discount %',
      validator: (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 && num <= 100 ? null : 'Discount must be between 0 and 100.';
      },
    },
    {
      key: 'liters',
      header: 'Liters',
      validator: (value) => {
        const num = Number(value);
        return Number.isFinite(num) && num > 0 ? null : 'Liters must be a positive number.';
      },
    },
  ];
}
