import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { FormatService } from '../../../core/services/format.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ICON_REGISTRY } from '../../../shared/icon-registry';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { requiredIfValidator } from '../../../shared/validators/required-if.validator';
import {
  CLAIM_MONTHS,
  CLAIM_REGIONS,
  CLAIM_TYPE_OPTIONS,
  ClaimType,
} from '../models/claim.model';

interface ClaimFormControls {
  type: FormControl<ClaimType | null>;
  region: FormControl<string | null>;
  head: FormControl<string>;
  month: FormControl<string | null>;
  year: FormControl<number | null>;
  amount: FormControl<number | null>;
  document: FormControl<string | null>;
  remarks: FormControl<string>;
}

// Claim creation — builder mode (CLAUDE.md §7): single-column form, live validation, errors
// shown on blur, submit disabled until valid. Document is required only for Damage claims.
// Submission wiring (create + navigate) lands in the next step of this flow.
@Component({
  selector: 'to-claim-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    SelectModule,
    TextareaModule,
    PageHeaderComponent,
  ],
  templateUrl: './claim-form.component.html',
  styleUrl: './claim-form.component.scss',
})
export class ClaimFormComponent {
  private readonly router = inject(Router);
  private readonly formatService = inject(FormatService);
  private readonly notificationService = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly typeOptions = CLAIM_TYPE_OPTIONS;
  protected readonly regionOptions = CLAIM_REGIONS.map((region) => ({ label: region, value: region }));
  protected readonly monthOptions = CLAIM_MONTHS.map((month) => ({ label: month, value: month }));
  protected readonly yearOptions = this.buildYearOptions();

  // Text shown in the amount field: raw digits while editing, "PKR 1,000,000" on blur.
  protected readonly amountText = signal('');
  protected readonly submitting = signal(false);
  protected readonly typeValue = signal<ClaimType | null>(null);
  protected readonly isDamage = computed(() => this.typeValue() === 'damage');

  protected readonly form: FormGroup<ClaimFormControls> = new FormGroup<ClaimFormControls>({
    type: new FormControl<ClaimType | null>(null, { validators: [Validators.required] }),
    region: new FormControl<string | null>(null, { validators: [Validators.required] }),
    head: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    month: new FormControl<string | null>(null, { validators: [Validators.required] }),
    year: new FormControl<number | null>(null, { validators: [Validators.required] }),
    amount: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    // Required only for Damage claims — re-validated when the type changes (see constructor).
    document: new FormControl<string | null>(null, {
      validators: [requiredIfValidator(() => this.form?.controls.type.value === 'damage')],
    }),
    remarks: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.form.controls.type.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.typeValue.set(value);
        // Damage-only document rule depends on the type control, so re-run its validator.
        this.form.controls.document.updateValueAndValidity();
      });
  }

  protected showError(control: keyof ClaimFormControls): boolean {
    const c = this.form.controls[control];
    return c.invalid && c.touched;
  }

  protected onAmountInput(event: Event): void {
    const digits = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    this.amountText.set(digits);
    this.form.controls.amount.setValue(digits ? Number(digits) : null);
  }

  protected onAmountFocus(): void {
    const value = this.form.controls.amount.value;
    this.amountText.set(value !== null ? String(value) : '');
  }

  protected onAmountBlur(): void {
    this.form.controls.amount.markAsTouched();
    const value = this.form.controls.amount.value;
    if (value !== null && value > 0) {
      this.amountText.set(this.formatService.formatPkr(value));
    }
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    this.form.controls.document.setValue(file ? file.name : null);
    this.form.controls.document.markAsTouched();
    input.value = '';
  }

  protected clearFile(): void {
    this.form.controls.document.setValue(null);
    this.form.controls.document.markAsTouched();
  }

  protected cancel(): void {
    this.router.navigateByUrl('/claims');
  }

  protected onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // Submission (create + navigate) is wired in the next step of this flow.
    this.notificationService.info(
      'Form is valid — submission is wired in the next step of this flow.',
      'Claim ready',
    );
  }

  private buildYearOptions(): { label: string; value: number }[] {
    const current = new Date().getFullYear();
    return [current - 1, current, current + 1].map((year) => ({ label: String(year), value: year }));
  }
}
