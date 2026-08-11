import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';

import { NotificationService } from '../../core/services/notification.service';
import { PermissionService } from '../../core/services/permission.service';
import { ICON_REGISTRY } from '../../shared/icon-registry';
import { ApprovalChainComponent } from '../../shared/components/approval-chain/approval-chain.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { HeadroomBarComponent } from '../../shared/components/headroom-bar/headroom-bar.component';
import { NumberDisplayComponent } from '../../shared/components/number-display/number-display.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { PipelineStageComponent } from '../../shared/components/pipeline-stage/pipeline-stage.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { RelativeDatePipe } from '../../shared/pipes/relative-date.pipe';
import {
  ApprovalDecision,
  ApprovalInboxItem,
  ApprovalItemType,
} from './models/approval-item.model';
import { ApprovalsService } from './services/approvals.service';

type InboxTab = 'all' | ApprovalItemType;

const TYPE_META: Record<ApprovalItemType, { label: string; icon: string }> = {
  budget: { label: 'Budget', icon: 'wallet' },
  scheme: { label: 'Scheme', icon: 'discount-2' },
  claim: { label: 'Claim', icon: 'file-invoice' },
};

// Dashboard = the approvals inbox (CLAUDE.md §7 queue mode): a triage surface where the
// user works pending Budget / Scheme / Claim decisions without leaving the list. Split
// pane — list left, detail right — with inline approve/reject on the current chain step.
@Component({
  selector: 'to-dashboard',
  standalone: true,
  imports: [
    TablerIconComponent,
    ButtonModule,
    PageHeaderComponent,
    ApprovalChainComponent,
    HeadroomBarComponent,
    PipelineStageComponent,
    EmptyStateComponent,
    SkeletonComponent,
    NumberDisplayComponent,
    RelativeDatePipe,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly approvalsService = inject(ApprovalsService);
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly typeMeta = TYPE_META;

  protected readonly items = signal<ApprovalInboxItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly deciding = signal(false);
  protected readonly activeTab = signal<InboxTab>('all');
  protected readonly selectedId = signal<string | null>(null);

  protected readonly tabs: { key: InboxTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'budget', label: 'Budgets' },
    { key: 'scheme', label: 'Schemes' },
    { key: 'claim', label: 'Claims' },
  ];

  protected readonly skeletonRows = Array.from({ length: 5 }, (_, i) => i);

  protected readonly filteredItems = computed(() => {
    const tab = this.activeTab();
    const items = this.items();
    return tab === 'all' ? items : items.filter((item) => item.type === tab);
  });

  protected readonly selectedItem = computed(
    () => this.items().find((item) => item.id === this.selectedId()) ?? null,
  );

  // canApprove drives the inline approve/reject controls inside to-approval-chain,
  // gated on the current user's permission for this item's type (CLAUDE.md §4).
  protected readonly canApproveSelected = computed(() => {
    const item = this.selectedItem();
    return item ? this.permissionService.canAccess(item.requiredPermission) : false;
  });

  constructor() {
    this.load();
  }

  protected countFor(tab: InboxTab): number {
    const items = this.items();
    return tab === 'all' ? items.length : items.filter((item) => item.type === tab).length;
  }

  protected selectTab(tab: InboxTab): void {
    this.activeTab.set(tab);
    this.autoSelect();
  }

  protected selectItem(id: string): void {
    this.selectedId.set(id);
  }

  protected retry(): void {
    this.load();
  }

  protected onApprove(event: { stepIndex: number; remarks: string }): void {
    this.resolve('approve', event.remarks);
  }

  protected onReject(event: { stepIndex: number; remarks: string }): void {
    this.resolve('reject', event.remarks);
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.approvalsService
      .getInbox()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.items.set(items);
          this.loading.set(false);
          this.autoSelect();
        },
        error: () => {
          this.loading.set(false);
          this.error.set(true);
        },
      });
  }

  // Keeps a valid selection as items load, the tab changes, or an item is resolved:
  // hold the current selection when it's still visible, otherwise fall to the first row.
  private autoSelect(): void {
    const visible = this.filteredItems();
    const current = this.selectedId();
    if (!current || !visible.some((item) => item.id === current)) {
      this.selectedId.set(visible[0]?.id ?? null);
    }
  }

  private resolve(decision: ApprovalDecision, remarks: string): void {
    const item = this.selectedItem();
    if (!item || this.deciding()) {
      return;
    }
    this.deciding.set(true);
    this.approvalsService
      .decide(item.id, decision, remarks)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.items.update((items) => items.filter((current) => current.id !== item.id));
          this.autoSelect();
          this.deciding.set(false);
          const verb = decision === 'approve' ? 'Approved' : 'Rejected';
          if (decision === 'approve') {
            this.notificationService.success(`${item.reference} — ${item.title}`, verb);
          } else {
            this.notificationService.warn(`${item.reference} — ${item.title}`, verb);
          }
        },
        error: () => {
          this.deciding.set(false);
          this.notificationService.error('Could not record your decision. Please try again.');
        },
      });
  }
}
