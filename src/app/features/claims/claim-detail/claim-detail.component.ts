import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';

import { NotificationService } from '../../../core/services/notification.service';
import { PermissionService } from '../../../core/services/permission.service';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { ActivityTimelineComponent } from '../../../shared/components/activity-timeline/activity-timeline.component';
import { ApprovalChainComponent } from '../../../shared/components/approval-chain/approval-chain.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { NumberDisplayComponent } from '../../../shared/components/number-display/number-display.component';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { PipelineStageComponent } from '../../../shared/components/pipeline-stage/pipeline-stage.component';
import { StatusPillComponent } from '../../../shared/components/status-pill/status-pill.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { RelativeDatePipe } from '../../../shared/pipes/relative-date.pipe';
import { CLAIM_PIPELINE_STAGES, ClaimType } from '../models/claim.model';
import { ClaimsService } from '../services/claims.service';

const TYPE_LABELS: Record<ClaimType, string> = {
  normal: 'Normal',
  delay: 'Delay',
  damage: 'Damage',
};

// Claim detail + approval. Reads the claim reactively from the store, so approving/rejecting
// (here or from the dashboard inbox) re-renders the pipeline, chain and timeline live.
// Approve/reject controls appear only with CLAIMS_APPROVE permission on an actionable claim.
@Component({
  selector: 'to-claim-detail',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    TextareaModule,
    PageHeaderComponent,
    PipelineStageComponent,
    ApprovalChainComponent,
    ActivityTimelineComponent,
    StatusPillComponent,
    NumberDisplayComponent,
    EmptyStateComponent,
    ConfirmDialogComponent,
    RelativeDatePipe,
  ],
  templateUrl: './claim-detail.component.html',
  styleUrl: './claim-detail.component.scss',
})
export class ClaimDetailComponent {
  readonly id = input.required<string>();

  private readonly claimsService = inject(ClaimsService);
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly typeLabels = TYPE_LABELS;
  protected readonly pipelineStages = [...CLAIM_PIPELINE_STAGES];

  protected readonly remarksControl = new FormControl('', { nonNullable: true });
  protected readonly deciding = signal(false);
  protected readonly rejectDialogVisible = signal(false);
  protected readonly rejectHint = signal(false);

  protected readonly claim = computed(() =>
    this.claimsService.claims().find((claim) => claim.id === this.id()),
  );

  private readonly hasApprovePermission = computed(() =>
    this.permissionService.canAccess('CLAIMS_APPROVE'),
  );

  // A claim is actionable while it's still moving through the pipeline.
  protected readonly isActionable = computed(() => {
    const claim = this.claim();
    return !!claim && (claim.status === 'pending' || claim.status === 'overdue');
  });

  protected readonly canApprove = computed(
    () => this.hasApprovePermission() && this.isActionable(),
  );

  protected readonly alreadyResolved = computed(
    () => this.hasApprovePermission() && !!this.claim() && !this.isActionable(),
  );

  protected typeLabel(type: ClaimType): string {
    return TYPE_LABELS[type];
  }

  protected onApprove(): void {
    const claim = this.claim();
    if (!claim || this.deciding()) {
      return;
    }
    this.deciding.set(true);
    this.claimsService
      .approve(claim.id, this.remarksControl.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.deciding.set(false);
          this.rejectHint.set(false);
          this.remarksControl.reset('');
          if (updated.status === 'approved') {
            this.notificationService.success(`${updated.id} is fully approved.`, 'Claim approved');
          } else {
            const stage = CLAIM_PIPELINE_STAGES[updated.currentStageIndex];
            this.notificationService.success(`Claim approved and moved to ${stage}.`, 'Claim approved');
          }
        },
        error: () => {
          this.deciding.set(false);
          this.notificationService.error('Could not record the approval. Please try again.');
        },
      });
  }

  protected onRejectClick(): void {
    if (!this.remarksControl.value.trim()) {
      this.rejectHint.set(true);
      return;
    }
    this.rejectDialogVisible.set(true);
  }

  protected onRejectCancelled(): void {
    this.rejectDialogVisible.set(false);
  }

  protected onRejectConfirmed(): void {
    const claim = this.claim();
    this.rejectDialogVisible.set(false);
    if (!claim || this.deciding()) {
      return;
    }
    this.deciding.set(true);
    this.claimsService
      .reject(claim.id, this.remarksControl.value.trim())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.deciding.set(false);
          this.remarksControl.reset('');
          this.notificationService.warn(`${updated.id} was rejected.`, 'Claim rejected');
        },
        error: () => {
          this.deciding.set(false);
          this.notificationService.error('Could not record the rejection. Please try again.');
        },
      });
  }
}
