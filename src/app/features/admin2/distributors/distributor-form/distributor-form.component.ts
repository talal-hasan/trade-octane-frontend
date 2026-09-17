import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  Signal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { map } from 'rxjs';

import {
  DistributorAccountCatalogueResponse,
  DistributorAccountResponse,
  DistributorCandidateResponse,
} from '../../../../core/api/admin2.models';
import { int } from '../../../../core/api/api.types';
import { HasUnsavedChanges } from '../../../../core/guards/unsaved-changes.guard';
import { NotificationService } from '../../../../core/services/notification.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { SkeletonComponent } from '../../../../shared/components/skeleton/skeleton.component';
import { StatusPillComponent } from '../../../../shared/components/status-pill/status-pill.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { contactNumberValidator } from '../../../../shared/validators/contact-number.validator';
import { legacyEmailValidator } from '../../../../shared/validators/legacy-email.validator';
import {
  legacyPasswordValidator,
  passwordRuleChecks,
} from '../../../../shared/validators/legacy-password.validator';
import { requiredIfValidator } from '../../../../shared/validators/required-if.validator';
import { Admin2DistributorsApi } from '../../services/admin2-distributors.api';
import { DistributorAccountsStore } from '../../services/distributor-accounts.store';
import {
  DISTRIBUTOR_FIELD_LABELS,
  DISTRIBUTOR_STATUS_LABELS,
  DISTRIBUTOR_STATUS_PILL,
  DISTRIBUTORS_ROUTE,
  DistributorRowStatus,
  distributorStatusOf,
  formatDate,
  hasResigned,
} from '../distributor.util';

/** A region, area or territory choice. `note` marks the account's stored value when it is not in the tree. */
interface LocationOption {
  code: string;
  name: string;
  note?: string;
}

interface CandidateOption {
  value: string;
  name: string;
  resigned: boolean;
  resignedOn: string;
}

interface PendingChange {
  label: string;
  from: string;
  to: string;
}

// Column widths the API refuses beyond, rather than let the legacy procedure truncate.
const CITY_MAX = 500;
const CONTACT_MAX = 255;
const EMAIL_MAX = 50;

/** Built-in `required` accepts "   "; the server trims and calls that missing. */
const NOT_BLANK = Validators.pattern(/\S/);

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** The API's machine-readable refusal, from the RFC 7807 body's `errorCode` extension. */
function errorCodeOf(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.error && typeof error.error === 'object') {
    const code = (error.error as Record<string, unknown>)['errorCode'];
    return typeof code === 'string' ? code : '';
  }
  return '';
}

/**
 * Create or edit a distributor's sign-in account — the form half of legacy's
 * `CPS_CreateDistributor.aspx`.
 *
 * Builder mode (CLAUDE.md §7): one form, the choices that narrow the next ones first, and a
 * summary beside it that states what will be saved before the click rather than after.
 *
 * What changed from legacy, and why the form looks the way it does:
 *
 * - **The Distributor picker offers only distributors with no account yet.** Legacy listed
 *   all 1,581 and then refused the 520 that had one. It is virtual-scrolled and searchable
 *   by id or name. Distributors the master says have resigned sort last and are flagged —
 *   still offered, as legacy did, but not silently.
 * - **Region → area → territory is one cascade.** A change clears what is below it, and a
 *   level with a single choice fills itself. Legacy posted the page back on every pick.
 * - **The password is never shown.** Legacy decrypted it into the Edit form. On edit, blank
 *   keeps the current password; the rules turn green as they are met, so a weak password is
 *   caught before the request rather than after it.
 * - **An account whose stored location has since been retired still opens.** Its stored
 *   region, area or territory is offered as "current", because the API re-checks the
 *   location only when part of it changes.
 */
@Component({
  selector: 'to-distributor-form',
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TablerIconComponent,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    PageHeaderComponent,
    EmptyStateComponent,
    SkeletonComponent,
    StatusPillComponent,
  ],
  templateUrl: './distributor-form.component.html',
  styleUrl: './distributor-form.component.scss',
})
export class DistributorFormComponent implements HasUnsavedChanges {
  /** Route param. Absent on create. Bound via `withComponentInputBinding()`. */
  readonly distributorId = input<string | undefined>(undefined);

  private readonly api = inject(Admin2DistributorsApi);
  private readonly store = inject(DistributorAccountsStore);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  protected readonly icons = ICON_REGISTRY;
  protected readonly route = DISTRIBUTORS_ROUTE;
  protected readonly statusPill = DISTRIBUTOR_STATUS_PILL;
  protected readonly statusLabels = DISTRIBUTOR_STATUS_LABELS;
  protected readonly formatDate = formatDate;
  protected readonly limits = { city: CITY_MAX, contact: CONTACT_MAX, email: EMAIL_MAX };

  protected readonly isEdit = computed(() => !!this.distributorId());

  protected readonly catalogue = signal<DistributorAccountCatalogueResponse | null>(null);
  protected readonly catalogueFailed = signal(false);
  protected readonly candidates = signal<readonly DistributorCandidateResponse[]>([]);
  protected readonly candidatesLoading = signal(false);
  protected readonly account = signal<DistributorAccountResponse | null>(null);
  protected readonly accountLoading = signal(false);
  protected readonly notFound = signal(false);
  protected readonly saving = signal(false);
  /** Set by the first submit, so the summary can say how many fields still need attention. */
  protected readonly attempted = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    distributorId: ['', [requiredIfValidator(() => !this.isEdit())]],
    businessTypeId: [0, [Validators.min(1)]],
    regionCode: ['', [Validators.required]],
    areaCode: ['', [Validators.required]],
    territoryCode: ['', [Validators.required]],
    city: ['', [Validators.required, NOT_BLANK, Validators.maxLength(CITY_MAX)]],
    contact: ['', [Validators.required, Validators.maxLength(CONTACT_MAX), contactNumberValidator()]],
    distributorEmail: ['', [Validators.required, Validators.maxLength(EMAIL_MAX), legacyEmailValidator()]],
    kpoEmail: ['', [Validators.required, Validators.maxLength(EMAIL_MAX), legacyEmailValidator()]],
    password: ['', [requiredIfValidator(() => !this.isEdit()), legacyPasswordValidator(() => this.signInId())]],
  });

  /** The form's value as a signal, so the cascade and the summary are plain computeds. */
  private readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  private readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  /**
   * The sign-in name: the route's id on edit, the picked distributor on create. Annotated
   * because the password validator reads it, which would make its type circular.
   */
  protected readonly signInId: Signal<string> = computed(() =>
    this.isEdit() ? (this.distributorId() ?? '') : this.value().distributorId,
  );

  // ─── Distributor picker ─────────────────────────────────────────────────────

  /** Still-working distributors first; resigned ones last and flagged. */
  protected readonly candidateOptions = computed<CandidateOption[]>(() => {
    const today = new Date();
    return this.candidates()
      .map((candidate) => ({
        value: candidate.distributorId,
        name: candidate.name || candidate.distributorId,
        resigned: hasResigned(candidate, today),
        resignedOn: formatDate(candidate.resignationDate),
      }))
      .sort((a, b) => Number(a.resigned) - Number(b.resigned) || COLLATOR.compare(a.value, b.value));
  });

  protected readonly resignedCandidateCount = computed(
    () => this.candidateOptions().filter((option) => option.resigned).length,
  );

  protected readonly selectedCandidate = computed(() => {
    const id = this.value().distributorId;
    return id ? (this.candidateOptions().find((option) => option.value === id) ?? null) : null;
  });

  // ─── Location cascade ───────────────────────────────────────────────────────

  private readonly selectedRegion = computed(
    () => this.catalogue()?.regions.find((region) => region.code === this.value().regionCode) ?? null,
  );

  private readonly selectedArea = computed(
    () => this.selectedRegion()?.areas.find((area) => area.code === this.value().areaCode) ?? null,
  );

  protected readonly regionOptions = computed<LocationOption[]>(() => {
    const regions = this.catalogue()?.regions ?? [];
    const options: LocationOption[] = regions.map((region) => ({ code: region.code, name: region.name || region.code }));
    const stored = this.account();
    if (stored?.regionCode && !regions.some((region) => region.code === stored.regionCode)) {
      options.unshift({
        code: stored.regionCode,
        name: stored.region || stored.regionCode,
        note: 'Current · no longer an active region',
      });
    }
    return options;
  });

  protected readonly areaOptions = computed<LocationOption[]>(() => {
    const areas = this.selectedRegion()?.areas ?? [];
    const options: LocationOption[] = areas.map((area) => ({ code: area.code, name: area.name || area.code }));
    const stored = this.account();
    const value = this.value();
    if (
      stored?.areaCode &&
      value.regionCode === stored.regionCode &&
      !areas.some((area) => area.code === stored.areaCode)
    ) {
      options.unshift({
        code: stored.areaCode,
        name: stored.area || stored.areaCode,
        note: 'Current · not under this region',
      });
    }
    return options;
  });

  protected readonly territoryOptions = computed<LocationOption[]>(() => {
    const territories = this.selectedArea()?.territories ?? [];
    const options: LocationOption[] = territories.map((territory) => ({
      code: territory.code,
      name: territory.name || territory.code,
    }));
    const stored = this.account();
    const value = this.value();
    if (
      stored?.territoryCode &&
      value.regionCode === stored.regionCode &&
      value.areaCode === stored.areaCode &&
      !territories.some((territory) => territory.code === stored.territoryCode)
    ) {
      options.unshift({
        code: stored.territoryCode,
        name: stored.territory || stored.territoryCode,
        note: 'Current · not under this area',
      });
    }
    return options;
  });

  protected readonly businessTypes = computed(() => {
    const types = (this.catalogue()?.businessTypes ?? []).map((type) => ({
      id: int(type.businessTypeId),
      name: type.name || `Type ${int(type.businessTypeId)}`,
    }));
    const stored = this.account();
    const storedId = stored ? int(stored.businessTypeId) : 0;
    if (storedId > 0 && !types.some((type) => type.id === storedId)) {
      types.push({ id: storedId, name: stored?.businessType || `Type ${storedId}` });
    }
    return types;
  });

  // ─── Summary ────────────────────────────────────────────────────────────────

  protected readonly businessTypeName = computed(
    () => this.businessTypes().find((type) => type.id === this.value().businessTypeId)?.name ?? '',
  );
  protected readonly regionName = computed(() => this.nameOf(this.regionOptions(), this.value().regionCode));
  protected readonly areaName = computed(() => this.nameOf(this.areaOptions(), this.value().areaCode));
  protected readonly territoryName = computed(() => this.nameOf(this.territoryOptions(), this.value().territoryCode));

  protected readonly displayName = computed(() =>
    this.isEdit() ? (this.account()?.name ?? '') : (this.selectedCandidate()?.name ?? ''),
  );

  protected readonly passwordChecks = computed(() => passwordRuleChecks(this.value().password, this.signInId()));

  /** On edit: what Save will change, field by field, against the account as loaded. */
  protected readonly changes = computed<PendingChange[]>(() => {
    const stored = this.account();
    if (!this.isEdit() || !stored) {
      return [];
    }
    const value = this.value();
    const out: PendingChange[] = [];
    const add = (field: string, from: string, to: string, differs: boolean) => {
      if (differs) {
        out.push({ label: DISTRIBUTOR_FIELD_LABELS[field] ?? field, from: from || '—', to: to || '—' });
      }
    };

    add('businessTypeId', stored.businessType, this.businessTypeName(), value.businessTypeId !== int(stored.businessTypeId));
    add('regionCode', stored.region || stored.regionCode, this.regionName(), value.regionCode !== stored.regionCode);
    add('areaCode', stored.area || stored.areaCode, this.areaName(), value.areaCode !== stored.areaCode);
    add(
      'territoryCode',
      stored.territory || stored.territoryCode,
      this.territoryName(),
      value.territoryCode !== stored.territoryCode,
    );
    add('city', stored.city, value.city.trim(), value.city.trim() !== stored.city);
    add('contact', stored.contact, value.contact.trim(), value.contact.trim() !== stored.contact);
    add(
      'distributorEmail',
      stored.distributorEmail,
      value.distributorEmail.trim(),
      value.distributorEmail.trim() !== stored.distributorEmail,
    );
    add('kpoEmail', stored.kpoEmail, value.kpoEmail.trim(), value.kpoEmail.trim() !== stored.kpoEmail);
    if (value.password) {
      out.push({ label: 'Password', from: '', to: 'Replaced' });
    }
    return out;
  });

  protected readonly invalidCount = computed(() => {
    this.status();
    this.value();
    return Object.values(this.form.controls).filter((control) => control.invalid).length;
  });

  protected readonly canSave = computed(
    () => !this.saving() && (!this.isEdit() || (this.account() !== null && this.changes().length > 0)),
  );

  constructor() {
    this.loadCatalogue();

    // Inputs are bound after construction, so the create/edit split waits for them.
    // `untracked`: the loaders read the store, and a store update must not reload the form.
    effect(() => {
      const id = this.distributorId();
      untracked(() => {
        if (id) {
          this.loadAccount(id);
        } else {
          this.loadCandidates();
        }
      });
    });
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty && !this.saving();
  }

  // ─── Loading ────────────────────────────────────────────────────────────────

  protected loadCatalogue(): void {
    this.catalogueFailed.set(false);
    this.api
      .catalogue()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogue) => this.catalogue.set(catalogue),
        error: () => this.catalogueFailed.set(true),
      });
  }

  private loadCandidates(): void {
    this.candidatesLoading.set(true);
    this.api
      .candidates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.candidates.set(rows);
          this.candidatesLoading.set(false);
        },
        error: () => this.candidatesLoading.set(false),
      });
  }

  /**
   * Opens instantly from the grid's copy of the account, then re-reads it. The fresh copy is
   * applied only while the form is untouched, so it never overwrites what the admin typed.
   */
  private loadAccount(distributorId: string): void {
    const cached = this.store.byId(distributorId);
    if (cached) {
      this.applyAccount(cached);
    } else {
      this.accountLoading.set(true);
    }

    this.api
      .get(distributorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (fresh) => {
          this.accountLoading.set(false);
          this.store.upsert(fresh);
          if (!cached || this.form.pristine) {
            this.applyAccount(fresh);
          }
        },
        error: (error: unknown) => {
          this.accountLoading.set(false);
          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
          }
        },
      });
  }

  private applyAccount(account: DistributorAccountResponse): void {
    this.account.set(account);
    this.form.reset({
      distributorId: account.distributorId,
      businessTypeId: int(account.businessTypeId),
      regionCode: account.regionCode,
      areaCode: account.areaCode,
      territoryCode: account.territoryCode,
      city: account.city,
      contact: account.contact,
      distributorEmail: account.distributorEmail,
      kpoEmail: account.kpoEmail,
      password: '',
    });
  }

  // ─── Interaction ────────────────────────────────────────────────────────────

  /** The password rule "must not contain the id" depends on which distributor is picked. */
  protected onDistributorChange(): void {
    this.form.controls.password.updateValueAndValidity();
  }

  protected setBusinessType(businessTypeId: number): void {
    const control = this.form.controls.businessTypeId;
    if (control.value !== businessTypeId) {
      control.setValue(businessTypeId);
      control.markAsDirty();
    }
    control.markAsTouched();
  }

  /** A new region voids the area and territory beneath it. A single choice fills itself. */
  protected onRegionChange(): void {
    const areas = this.areaOptions();
    this.form.patchValue({ areaCode: areas.length === 1 ? areas[0].code : '', territoryCode: '' });
    this.fillSingleTerritory();
  }

  protected onAreaChange(): void {
    this.form.patchValue({ territoryCode: '' });
    this.fillSingleTerritory();
  }

  private fillSingleTerritory(): void {
    const territories = this.territoryOptions();
    if (territories.length === 1) {
      this.form.patchValue({ territoryCode: territories[0].code });
    }
  }

  protected showError(control: AbstractControl): boolean {
    return control.invalid && (control.touched || this.attempted());
  }

  protected emailError(control: AbstractControl): string {
    if (control.hasError('required')) {
      return 'An email address is required.';
    }
    if (control.hasError('maxlength')) {
      return `Use at most ${EMAIL_MAX} characters.`;
    }
    return 'Enter an address like name@company.com.';
  }

  // ─── Save ───────────────────────────────────────────────────────────────────

  protected submit(): void {
    this.attempted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.canSave()) {
      return;
    }

    const value = this.form.getRawValue();
    const details = {
      businessTypeId: value.businessTypeId,
      regionCode: value.regionCode,
      areaCode: value.areaCode,
      territoryCode: value.territoryCode,
      city: value.city.trim(),
      contact: value.contact.trim(),
      distributorEmail: value.distributorEmail.trim(),
      kpoEmail: value.kpoEmail.trim(),
    };

    this.saving.set(true);
    const id = this.distributorId();

    if (id) {
      this.api
        .update(id, { ...details, password: value.password || undefined })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (response) => {
            this.store.upsert(response.distributor);
            const changed = response.changedFields.map((field) => DISTRIBUTOR_FIELD_LABELS[field] ?? field);
            if (changed.length > 0) {
              this.notifications.success(`${response.distributor.name} saved. Updated: ${changed.join(', ')}.`);
            } else {
              this.notifications.info(`${response.distributor.name} already had these details. Nothing changed.`);
            }
            this.leave(response.distributor.distributorId);
          },
          error: () => this.saving.set(false),
        });
      return;
    }

    this.api
      .create({ ...details, distributorId: value.distributorId, password: value.password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.store.upsert(created);
          this.notifications.success(`${created.name} can now sign in as ${created.distributorId}.`);
          this.leave(created.distributorId);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          // Someone created this account first, or the master changed under the picker:
          // refresh the choices rather than leave a stale one selected.
          const code = errorCodeOf(error);
          if (code.endsWith('.already_exists') || code.endsWith('.not_in_master')) {
            this.form.controls.distributorId.setValue('');
            this.loadCandidates();
          }
        },
      });
  }

  /** Back to the grid, which brings the saved row into view and marks it. */
  private leave(distributorId: string): void {
    this.form.markAsPristine();
    this.saving.set(false);
    void this.router.navigate([DISTRIBUTORS_ROUTE], { queryParams: { saved: distributorId } });
  }

  private nameOf(options: readonly LocationOption[], code: string): string {
    return code ? (options.find((option) => option.code === code)?.name ?? code) : '';
  }

  protected accountStatus(account: DistributorAccountResponse): DistributorRowStatus {
    return distributorStatusOf(account);
  }
}
