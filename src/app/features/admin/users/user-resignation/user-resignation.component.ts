import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { Subscription } from 'rxjs';

import { ResignationResponse } from '../../../../core/api/admin.models';
import { NotificationService } from '../../../../core/services/notification.service';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import {
  RESIGNATION_MAX_FUTURE_DAYS,
  RESIGNATION_MIN_YEAR,
  ResignationDateProblem,
  resignationDateValidator,
  resignationMaxDate,
  resignationMinDate,
  toIsoDate,
} from '../../../../shared/validators/resignation-date.validator';
import { AdminResignationsApi } from '../../services/admin-resignations.api';

/** How the stored value got there. Drives the wording of the "current" card. */
export type ResignationProvenance = 'none' | 'recorded' | 'stamped';

const PROBLEM_MESSAGES: Record<ResignationDateProblem, string> = {
  malformed: 'Enter a real calendar date.',
  tooEarly: `Dates before 1 January ${RESIGNATION_MIN_YEAR} are not accepted.`,
  tooLate: `That is more than ${RESIGNATION_MAX_FUTURE_DAYS} days away — check the year.`,
};

/**
 * The Resignation tab of a user — legacy `UpdateResignation.aspx`, menu row 133.
 *
 * **The legacy screen was a user dropdown, a date box and a grid, and it stored wrong
 * dates silently.** Its DAL pasted the box's `dd-MM-yyyy` text into the SQL statement,
 * where the server parsed it under the connection's `DATEFORMAT` — `mdy` by default. A day
 * above 12 failed loudly; a day of 12 or below was stored with day and month transposed,
 * with no error at all. Someone entering 5 March got 3 May, for roughly twelve days in
 * every thirty-one.
 *
 * Three things follow from that, and they are the shape of this screen:
 *
 * 1. **The date is never text.** The input is `type="date"`, so the browser renders it in
 *    the administrator's own locale while its value is always `yyyy-MM-dd`, which is what
 *    goes on the wire and binds as a parameter. There is no format to get wrong.
 * 2. **Dates already stored are flagged, not trusted.** `dateFormatSuspect` marks a value
 *    that could have been transposed, and the panel shows the other reading beside it with
 *    a one-click correction. It is a candidate, not a verdict — 3 May and 5 March are
 *    indistinguishable after the fact, so the screen asks rather than assumes.
 * 3. **Clearing exists.** Legacy had no way to remove a date: an empty box wrote
 *    `set Resignation_Date = ''`, which SQL Server stores as 1900-01-01. So the only way to
 *    "clear" a wrong date was to store a different wrong one.
 *
 * **Recording a resignation does not close the account**, here or in legacy, and the panel
 * says so rather than leaving an administrator to infer it from the word. Deactivating is
 * a separate action in the page header.
 *
 * One request when the tab opens, and none after a write: both verbs return the resulting
 * state, so the panel and the header strip above it update from the response.
 */
@Component({
  selector: 'to-user-resignation',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    EmptyStateComponent,
    SkeletonComponent,
    ConfirmDialogComponent,
  ],
  templateUrl: './user-resignation.component.html',
  styleUrl: './user-resignation.component.scss',
})
export class UserResignationComponent {
  readonly userId = input.required<string>();

  /**
   * False when the account is deactivated. The client's rule (2026-09-21): an inactive
   * account is read-only until it is activated. The resignation endpoints refuse it too, so
   * this only decides whether the controls are inert or the admin discovers it on save.
   */
  readonly editable = input(true);

  /**
   * The account's resignation date after a write, so the identity strip on the parent
   * screen stays in step without re-reading the user.
   */
  readonly changed = output<string | null>();

  private readonly api = inject(AdminResignationsApi);
  private readonly notifications = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;

  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** The account exists in the directory but not in the table this slice reads. */
  protected readonly notFound = signal(false);
  protected readonly record = signal<ResignationResponse | null>(null);
  protected readonly saving = signal(false);
  protected readonly clearing = signal(false);
  protected readonly confirmingClear = signal(false);

  private request: Subscription | null = null;

  // ─── The date field ─────────────────────────────────────────────────────────

  protected readonly form = this.fb.nonNullable.group({
    resignationDate: ['', [resignationDateValidator()]],
  });

  private get dateControl() {
    return this.form.controls.resignationDate;
  }

  private readonly dateValue = toSignal(this.dateControl.valueChanges, { initialValue: '' });

  /**
   * Bounds handed to the input so the browser's own picker refuses what the server would.
   * Read once per instance: the tab is short-lived, and a range that shifted under the
   * administrator mid-edit would be worse than one that is a day stale.
   */
  protected readonly minDate = resignationMinDate();
  protected readonly maxDate = resignationMaxDate();

  /** The stored value reduced to its date part — the form's baseline. */
  protected readonly storedDate = computed(() => datePartOf(this.record()?.resignationDate));

  protected readonly dirty = computed(() => this.dateValue().trim() !== this.storedDate());

  protected readonly problem = computed<ResignationDateProblem | null>(() => {
    // Read through the signal so this recomputes as the administrator types; the control
    // itself is not reactive.
    this.dateValue();
    return (this.dateControl.errors?.['resignationDate'] as ResignationDateProblem) ?? null;
  });

  protected readonly problemMessage = computed(() => {
    const problem = this.problem();
    return problem ? PROBLEM_MESSAGES[problem] : null;
  });

  protected readonly canSave = computed(
    () =>
      this.editable() &&
      this.dirty() &&
      !this.problem() &&
      this.dateValue().trim().length > 0 &&
      !this.busy(),
  );

  protected readonly busy = computed(() => this.saving() || this.clearing());

  // ─── What is on file ────────────────────────────────────────────────────────

  /**
   * Where the stored date came from.
   *
   * `stamped` is a value written by the activate/deactivate path, which puts `getdate()`
   * into this column when an account is switched off without a date. That is the moment
   * the account was closed, not the day the person left, and presenting the two as the
   * same fact is how a leaving date becomes fiction.
   */
  protected readonly provenance = computed<ResignationProvenance>(() => {
    const record = this.record();
    if (!record?.resignationDate) {
      return 'none';
    }
    return record.stampedOnDeactivation ? 'stamped' : 'recorded';
  });

  protected readonly storedLabel = computed(() => longDate(this.record()?.resignationDate));

  /** The time a stamped value carries — the only part that says when it was switched off. */
  protected readonly stampedTime = computed(() => {
    const record = this.record();
    if (!record?.resignationDate || !record.stampedOnDeactivation) {
      return null;
    }
    const parsed = new Date(record.resignationDate);
    return Number.isNaN(parsed.getTime())
      ? null
      : new Intl.DateTimeFormat('en-PK', { hour: '2-digit', minute: '2-digit' }).format(parsed);
  });

  /** The other way to read a suspect date, as a label, or null when there is none. */
  protected readonly alternativeLabel = computed(() => {
    const record = this.record();
    return record?.dateFormatSuspect && record.suspectAlternativeDate
      ? longDate(record.suspectAlternativeDate)
      : null;
  });

  /**
   * True only while the *stored* value is still the suspect one.
   *
   * Once the administrator picks a different date in the field the banner has served its
   * purpose, and leaving it up would keep warning about a value they are already replacing.
   */
  protected readonly showSuspectBanner = computed(
    () => this.record()?.dateFormatSuspect === true && !this.dirty(),
  );

  protected readonly hasDate = computed(() => this.storedDate().length > 0);

  constructor() {
    effect(() => {
      const userId = this.userId();
      untracked(() => this.load(userId));
    });

    // Disabling the control, not just the Save button: letting someone type a date into a
    // field that can never be submitted is a worse way to learn the account is switched off
    // than finding the field inert.
    effect(() => {
      const editable = this.editable();
      untracked(() => {
        if (editable) {
          this.dateControl.enable({ emitEvent: false });
        } else {
          this.dateControl.disable({ emitEvent: false });
        }
      });
    });
  }

  /** Whether leaving the tab would discard a date the administrator has typed. */
  hasUnsavedChanges(): boolean {
    return this.dirty() && !this.busy();
  }

  private load(userId: string): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.failed.set(false);
    this.notFound.set(false);

    this.request = this.api
      .get(userId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (record) => this.apply(record),
        error: (error: HttpErrorResponse) => {
          this.loading.set(false);
          if (error.status === 404) {
            this.notFound.set(true);
          } else {
            this.failed.set(true);
          }
        },
      });
  }

  /** Puts the panel and the field onto a server response. The single place both move. */
  private apply(record: ResignationResponse): void {
    this.record.set(record);
    this.dateControl.setValue(datePartOf(record.resignationDate));
    this.dateControl.markAsPristine();
    this.loading.set(false);
  }

  protected retry(): void {
    this.load(this.userId());
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  protected setToday(): void {
    this.dateControl.setValue(toIsoDate(new Date()));
  }

  /** Takes the transposed reading of a suspect date — the correction, in one click. */
  protected useAlternative(): void {
    const alternative = this.record()?.suspectAlternativeDate;
    if (alternative) {
      this.dateControl.setValue(alternative);
    }
  }

  protected discard(): void {
    this.dateControl.setValue(this.storedDate());
  }

  protected save(): void {
    if (!this.canSave()) {
      this.dateControl.markAsTouched();
      return;
    }

    const date = this.dateValue().trim();
    this.saving.set(true);

    this.api
      .set(this.userId(), date)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.apply(response.user);
          this.changed.emit(response.user.resignationDate);

          // The account staying open is the fact most likely to surprise someone who read
          // "resignation" as "revoke access", so it goes in the confirmation rather than
          // only in the note below the form.
          this.notifications.success(
            response.accountRemainsActive
              ? `Resignation date set to ${longDate(response.user.resignationDate)}. The account can still sign in.`
              : `Resignation date set to ${longDate(response.user.resignationDate)}.`,
          );
        },
        error: () => this.saving.set(false),
      });
  }

  protected confirmClear(): void {
    this.confirmingClear.set(false);

    if (!this.editable()) {
      return;
    }
    this.clearing.set(true);

    this.api
      .clear(this.userId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.clearing.set(false);
          this.apply(response.user);
          this.changed.emit(response.user.resignationDate);

          // The value that went is named. An administrator undoing a date entered under the
          // legacy format bug needs to be able to put it back if they cleared the wrong one.
          this.notifications.success(
            response.previousResignationDate
              ? `Cleared ${longDate(response.previousResignationDate)}. No resignation is on file now.`
              : 'No resignation is on file now.',
          );
        },
        error: () => this.clearing.set(false),
      });
  }
}

/**
 * The date part of a stored value, as `yyyy-MM-dd`.
 *
 * Taken off the front of the string rather than through `Date`, on purpose: these columns
 * are `datetime` with no offset, so parsing and re-formatting would shift the day whenever
 * the browser's zone disagrees with the one the value was written in.
 */
function datePartOf(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}

/** "12 March 2026" — unambiguous about which half is the month, which is the whole point. */
function longDate(value: string | null | undefined): string {
  const iso = datePartOf(value);
  if (!iso) {
    return '—';
  }
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}
