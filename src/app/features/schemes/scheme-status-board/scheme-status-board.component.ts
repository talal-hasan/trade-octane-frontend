import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { NotificationService } from '../../../core/services/notification.service';
import { PermissionService } from '../../../core/services/permission.service';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { ActivityTimelineComponent } from '../../../shared/components/activity-timeline/activity-timeline.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../shared/components/skeleton/skeleton.component';
import {
  SCHEME_STATUS_LABELS,
  SCHEME_TYPE_LABELS,
  Scheme,
  SchemeStatus,
  SchemeType,
} from '../models/scheme.model';
import { SchemesService } from '../services/schemes.service';

const EXPIRY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

// Scheme status board — adapts the 21st.dev "management table" pattern (row-as-card,
// segmented meter, status accent, row-click detail overlay with lifecycle actions) to trade
// schemes. Lifecycle (pause/resume/expire) is gated on SCHEME_APPROVE and duplicate on
// SCHEME_CREATE (CLAUDE.md §4); expiry is confirmed first (§8). State is signal-based off the
// shared schemes store, so an action re-renders the row and the open detail together.
@Component({
  selector: 'to-scheme-status-board',
  standalone: true,
  imports: [
    TablerIconComponent,
    ButtonModule,
    DialogModule,
    TooltipModule,
    PageHeaderComponent,
    ActivityTimelineComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    SkeletonComponent,
  ],
  templateUrl: './scheme-status-board.component.html',
  styleUrl: './scheme-status-board.component.scss',
})
export class SchemeStatusBoardComponent {
  private readonly schemesService = inject(SchemesService);
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly typeLabels = SCHEME_TYPE_LABELS;
  protected readonly statusLabels = SCHEME_STATUS_LABELS;
  protected readonly meterCells = Array.from({ length: 10 }, (_, i) => i);
  protected readonly skeletonRows = Array.from({ length: 4 }, (_, i) => i);

  protected readonly schemes = this.schemesService.schemes;
  protected readonly loading = signal(true);
  protected readonly error = signal(false);
  protected readonly deciding = signal(false);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly expireDialogVisible = signal(false);
  private readonly expireTargetId = signal<string | null>(null);

  protected readonly selectedScheme = computed(
    () => this.schemes().find((scheme) => scheme.id === this.selectedId()) ?? null,
  );
  protected readonly detailVisible = computed(() => this.selectedScheme() !== null);

  // Lifecycle management is gated per CLAUDE.md §4; read reactively so the role switcher
  // shows/hides actions live.
  protected readonly canManage = computed(() => this.permissionService.canAccess('SCHEME_APPROVE'));
  protected readonly canDuplicate = computed(() =>
    this.permissionService.canAccess('SCHEME_CREATE'),
  );

  protected readonly activeCount = computed(() => this.countBy('active'));
  protected readonly pausedCount = computed(() => this.countBy('paused'));
  protected readonly expiredCount = computed(() => this.countBy('expired'));

  constructor() {
    this.load();
  }

  protected ordinal(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  protected typeLabel(type: SchemeType): string {
    return SCHEME_TYPE_LABELS[type];
  }

  protected brandInitials(brand: string): string {
    return brand.slice(0, 2).toUpperCase();
  }

  protected filledMeterCells(percent: number): number {
    return Math.round((percent / 100) * this.meterCells.length);
  }

  protected formatExpiry(iso: string): string {
    return EXPIRY_FORMATTER.format(new Date(iso));
  }

  protected openDetail(scheme: Scheme): void {
    this.selectedId.set(scheme.id);
  }

  protected onDetailVisibleChange(visible: boolean): void {
    if (!visible) {
      this.selectedId.set(null);
    }
  }

  protected pause(scheme: Scheme): void {
    this.run(this.schemesService.setStatus(scheme.id, 'paused'), (updated) =>
      this.notificationService.success(`${updated.id} paused.`, 'Scheme paused'),
    );
  }

  protected resume(scheme: Scheme): void {
    this.run(this.schemesService.setStatus(scheme.id, 'active'), (updated) =>
      this.notificationService.success(`${updated.id} resumed.`, 'Scheme resumed'),
    );
  }

  protected requestExpire(scheme: Scheme): void {
    this.expireTargetId.set(scheme.id);
    this.expireDialogVisible.set(true);
  }

  protected confirmExpire(): void {
    const id = this.expireTargetId();
    this.expireDialogVisible.set(false);
    if (!id) {
      return;
    }
    this.run(this.schemesService.setStatus(id, 'expired'), (updated) =>
      this.notificationService.warn(`${updated.id} expired.`, 'Scheme expired'),
    );
  }

  protected cancelExpire(): void {
    this.expireDialogVisible.set(false);
    this.expireTargetId.set(null);
  }

  protected duplicate(scheme: Scheme): void {
    this.run(this.schemesService.duplicate(scheme.id), (created) => {
      this.notificationService.success(`Duplicated as ${created.id}.`, 'Scheme duplicated');
      this.selectedId.set(created.id);
    });
  }

  protected retry(): void {
    this.load();
  }

  private run(op: Observable<Scheme>, onNext: (scheme: Scheme) => void): void {
    if (this.deciding()) {
      return;
    }
    this.deciding.set(true);
    op.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (scheme) => {
        this.deciding.set(false);
        onNext(scheme);
      },
      error: () => {
        this.deciding.set(false);
        this.notificationService.error('Could not complete that action. Please try again.');
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.schemesService
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

  private countBy(status: SchemeStatus): number {
    return this.schemes().filter((scheme) => scheme.status === status).length;
  }
}
