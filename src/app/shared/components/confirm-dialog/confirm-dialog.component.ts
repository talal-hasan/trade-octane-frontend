import { Component, input, output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

export type ConfirmDialogVariant = 'default' | 'danger';

// PrimeNG Dialog wrapper always used for destructive actions (CLAUDE.md §9), e.g. scheme
// expiry, which fires instantly via API and must be confirmed first (CLAUDE.md §8 Schemes).
@Component({
  selector: 'to-confirm-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  readonly visible = input.required<boolean>();
  readonly visibleChange = output<boolean>();

  readonly title = input<string>('Are you sure?');
  readonly message = input.required<string>();
  readonly confirmLabel = input<string>('Confirm');
  readonly cancelLabel = input<string>('Cancel');
  readonly variant = input<ConfirmDialogVariant>('default');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected onVisibleChange(value: boolean): void {
    this.visibleChange.emit(value);
    // Dialog can be dismissed via mask click / Esc — treat that the same as Cancel
    // so callers only need to react to one "did not confirm" signal.
    if (!value) {
      this.cancelled.emit();
    }
  }

  protected onCancel(): void {
    this.visibleChange.emit(false);
    this.cancelled.emit();
  }

  protected onConfirm(): void {
    this.confirmed.emit();
    this.visibleChange.emit(false);
  }
}
