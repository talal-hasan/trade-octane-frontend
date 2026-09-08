import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TablerIconComponent } from '@tabler/icons-angular';
import { ButtonModule } from 'primeng/button';

import { NotificationService } from '../../../../core/services/notification.service';
import { ALL_ROLES, ROLE_LABELS, Role } from '../../../../core/models/role.model';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import { minSelectionValidator } from '../../../../shared/validators/min-selection.validator';
import { SuccessPanelComponent } from '../../../../shared/components/success-panel/success-panel.component';
import {
  WizardStep,
  WizardStepsComponent,
} from '../../../../shared/components/wizard-steps/wizard-steps.component';
import { AccessSummaryComponent } from '../access-summary/access-summary.component';
import { PermissionMatrixComponent } from '../permission-matrix/permission-matrix.component';
import {
  ACCESS_TEMPLATES,
  AccessTemplate,
  AdminUser,
  BRANDS,
  CITIES,
  DirectoryPerson,
  DistributorRecord,
  REGIONS,
  USER_TYPE_HINTS,
  USER_TYPE_LABELS,
  UserType,
} from '../models/admin-user.model';
import { AdminUsersService } from '../services/admin-users.service';

/** Suffix on generated temporary usernames, per the convention in KT Meeting 2 §3. */
const TEMP_SUFFIX = 'FCBL';

// ═══════════════════════════════════════════════════════════════════════════════
// User provisioning — one screen, three decisions.
//
// Researched against how enterprise IAM products actually do this:
//
//   Microsoft Entra ID   Tabbed wizard — Basics → Properties → Assignments →
//                        Review + create. Thorough, but every tab is a click and you
//                        never see the whole picture until the last step.
//   Okta                 Add Person, then assign groups, then assign an admin role —
//                        three separate screens for one mental task.
//   AWS IAM Identity     Permission sets: a named, reusable bundle of access that gets
//   Center               attached to a user in one action. This is the good idea.
//   ServiceNow / SAP GRC "Copy roles from user" / reference-user derivation — an admin
//                        provisioning a new RSM copies the last RSM. This is the other
//                        good idea, and it is what admins actually do in practice.
//
// The client asked for the fewest clicks possible, so this screen takes the two good
// ideas and drops the wizard:
//
//   · ONE page, not four tabs. The summary that Entra puts behind a "Review" tab is a
//     live panel here, so the admin sees the consequence of every click as they make it.
//   · ACCESS TEMPLATES (AWS's permission sets) turn ~14 permission checkboxes into one
//     click, and pre-fill scope too. The template is a starting point, never a lock —
//     every field stays editable and the summary shows any drift from the template.
//   · COPY FROM AN EXISTING USER mirrors a peer's entire access in one click.
//   · DIRECTORY LOOKUP means a company user is *found*, not typed: name, email and home
//     region arrive from AD (KT Meeting 2 §1), so identity costs one search and one pick.
//
// Best case — a company user on a standard template — is four clicks and one search:
//   search name → pick person → pick template → Create.
// The click counter in the summary panel is not decoration; it is the client's stated
// acceptance criterion, kept visible so it can't quietly regress.
// ═══════════════════════════════════════════════════════════════════════════════
@Component({
  selector: 'to-user-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TablerIconComponent,
    ButtonModule,
    PageHeaderComponent,
    PermissionMatrixComponent,
    AccessSummaryComponent,
    WizardStepsComponent,
    SuccessPanelComponent,
  ],
  templateUrl: './user-form.component.html',
  styleUrl: './user-form.component.scss',
})
export class UserFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly usersService = inject(AdminUsersService);
  private readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = ICON_REGISTRY;
  protected readonly roleLabels = ROLE_LABELS;
  protected readonly allRoles = ALL_ROLES;
  protected readonly typeLabels = USER_TYPE_LABELS;
  protected readonly typeHints = USER_TYPE_HINTS;
  protected readonly regions = REGIONS;
  protected readonly brands = BRANDS;
  protected readonly userTypes: UserType[] = ['ad', 'distributor', 'temporary'];

  protected readonly form = this.fb.group({
    userType: this.fb.nonNullable.control<UserType>('ad'),
    name: this.fb.nonNullable.control('', Validators.required),
    email: this.fb.nonNullable.control('', [Validators.required, Validators.email]),
    endDate: this.fb.nonNullable.control(''),
    distributorCode: this.fb.nonNullable.control(''),
    city: this.fb.nonNullable.control(''),
    roles: this.fb.nonNullable.control<Role[]>([], minSelectionValidator(1)),
    permissions: this.fb.nonNullable.control<string[]>([], minSelectionValidator(1)),
    regions: this.fb.nonNullable.control<string[]>([], minSelectionValidator(1)),
    brands: this.fb.nonNullable.control<string[]>([]),
  });

  // Mirror the reactive form into signals so the summary panel, the validity gates and
  // the template cards can all be `computed()` off it rather than hand-wired subscriptions.
  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });
  private readonly status = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  protected readonly userType = computed<UserType>(() => this.value().userType ?? 'ad');
  protected readonly selectedRoles = computed<Role[]>(() => this.value().roles ?? []);
  protected readonly selectedPermissions = computed<string[]>(() => this.value().permissions ?? []);
  protected readonly selectedRegions = computed<string[]>(() => this.value().regions ?? []);
  protected readonly selectedBrands = computed<string[]>(() => this.value().brands ?? []);

  // ─── Directory lookup ────────────────────────────────────────────────────────
  protected readonly directoryQuery = signal('');
  protected readonly directoryResults = signal<DirectoryPerson[]>([]);
  protected readonly directorySearching = signal(false);
  protected readonly pickedPerson = signal<DirectoryPerson | null>(null);

  protected readonly distributorQuery = signal('');
  protected readonly distributorResults = signal<DistributorRecord[]>([]);
  protected readonly pickedDistributor = signal<DistributorRecord | null>(null);

  // ─── Templates and cloning ───────────────────────────────────────────────────
  protected readonly appliedTemplate = signal<AccessTemplate | null>(null);
  protected readonly clonedFrom = signal<AdminUser | null>(null);
  protected readonly submitting = signal(false);

  /** Only templates valid for the chosen user type — no RSM template on a distributor. */
  protected readonly templates = computed(() =>
    ACCESS_TEMPLATES.filter((template) => template.appliesTo.includes(this.userType())),
  );

  /** Existing users this admin could mirror, matching the chosen user type. */
  protected readonly cloneCandidates = computed(() =>
    this.usersService
      .users()
      .filter((user) => user.userType === this.userType() && user.status === 'active')
      .slice(0, 6),
  );

  protected readonly cityOptions = computed(() => {
    const region = this.selectedRegions()[0];
    return region ? (CITIES[region] ?? []) : [];
  });

  // ─── Wizard state ────────────────────────────────────────────────────────────
  // The single-page form put identity, six template cards, seven role chips, a permission
  // matrix and two scope pickers on screen at once — accurate, but a wall. Splitting it
  // into three stages shows only what the current decision needs.
  //
  // The catch: a wizard normally *costs* clicks, and the client's stated requirement is
  // the opposite. So advancing is automatic wherever the choice is unambiguous — picking
  // a person completes step 1, applying a template completes step 2 — and the Next button
  // is the fallback for the cases where it isn't (typing a temporary username, hand-picking
  // roles). Net click count is unchanged from the single-page version; see `clicks`.
  protected readonly steps: WizardStep[] = [
    { key: 'identity', label: 'Identity', hint: 'Who is this?' },
    { key: 'access', label: 'Access', hint: 'What do they do?' },
    { key: 'scope', label: 'Scope', hint: 'Where do they do it?' },
  ];

  protected readonly currentStep = signal(0);
  protected readonly furthestStep = signal(0);
  /** Set once creation succeeds; swaps the whole form out for the success panel. */
  protected readonly createdUser = signal<AdminUser | null>(null);

  /** Identity is complete once the form has a valid name/email plus any type extras. */
  protected readonly identityValid = computed(() => {
    // Read `value()` so this recomputes on every edit — the controls themselves are not
    // signals, so touching only `this.form.controls` would leave this stale.
    this.value();
    const { name, email, endDate, distributorCode, city } = this.form.controls;
    if (name.invalid || email.invalid) {
      return false;
    }
    const type = this.userType();
    if (type === 'temporary') {
      return endDate.valid;
    }
    if (type === 'distributor') {
      return distributorCode.valid && city.valid;
    }
    return true;
  });

  protected readonly accessValid = computed(
    () => this.selectedRoles().length > 0 && this.selectedPermissions().length > 0,
  );

  protected readonly scopeValid = computed(() => this.selectedRegions().length > 0);

  /** Whether the step currently on screen is complete enough to leave. */
  protected readonly currentStepValid = computed(() => {
    switch (this.currentStep()) {
      case 0:
        return this.identityValid();
      case 1:
        return this.accessValid();
      default:
        return this.scopeValid();
    }
  });

  protected readonly isLastStep = computed(() => this.currentStep() === this.steps.length - 1);

  // ─── Click accounting ────────────────────────────────────────────────────────
  // Counts real user interactions, so the "fewest clicks" claim is measured rather than
  // asserted. Incremented at each interaction handler, never derived from form state
  // (which would under-count re-picks and over-count programmatic writes). Auto-advance
  // deliberately does NOT increment — that is the whole point of it.
  protected readonly clicks = signal(0);

  protected readonly canSubmit = computed(() => this.status() === 'VALID' && !this.submitting());

  /** Plain-English restatement of what this user will be able to do, for the summary. */
  protected readonly effectSentence = computed(() => {
    const name = this.value().name?.trim() || 'This user';
    const roles = this.selectedRoles();
    const regions = this.selectedRegions();
    const brands = this.selectedBrands();
    const permissions = this.selectedPermissions();

    if (roles.length === 0 || regions.length === 0) {
      return 'Pick a role and at least one region to see what this user will be able to do.';
    }

    const roleText = roles.map((role) => ROLE_LABELS[role]).join(' and ');
    const canApprove = permissions.filter((permission) => permission.endsWith('_APPROVE'));
    const approveText =
      canApprove.length > 0
        ? ` They can approve ${canApprove
            .map((permission) => permission.split('_')[0].toLowerCase())
            .join(', ')}.`
        : ' They cannot approve anything.';
    const brandText = brands.length > 0 ? ` for ${brands.join(', ')}` : ' across all brands';

    return `${name} will act as ${roleText} in ${regions.join(', ')}${brandText}.${approveText}`;
  });

  /** No brand filter means every brand, so the summary says "All" rather than "0". */
  protected readonly brandLabel = computed(() => {
    const count = this.selectedBrands().length;
    return count === 0 ? 'All' : `${count}`;
  });

  /** Where the current access came from — shown so a grant is never unattributed. */
  protected readonly sourceLabel = computed(() => {
    const template = this.appliedTemplate();
    if (template) {
      return `From ${template.label}`;
    }
    const cloned = this.clonedFrom();
    return cloned ? `Mirrored from ${cloned.name}` : null;
  });

  protected readonly sourceIcon = computed(() => (this.appliedTemplate() ? 'check' : 'copy'));

  /** True once the admin has hand-edited access away from the applied template. */
  protected readonly driftedFromTemplate = computed(() => {
    const template = this.appliedTemplate();
    if (!template) {
      return false;
    }
    const current = [...this.selectedPermissions()].sort();
    const original = [...template.permissions].sort();
    return current.join('|') !== original.join('|');
  });

  constructor() {
    this.usersService.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    // Switching user type invalidates the identity fields and the template that was
    // chosen for the previous type, so reset both rather than leaving stale state that
    // would silently submit. Scope and roles are cleared too — they came from a template
    // that no longer applies.
    this.form.controls.userType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => this.onUserTypeChanged(type));
  }

  // ─── Wizard navigation ───────────────────────────────────────────────────────
  protected goToStep(index: number): void {
    const clamped = Math.max(0, Math.min(index, this.steps.length - 1));
    this.currentStep.set(clamped);
    this.furthestStep.update((furthest) => Math.max(furthest, clamped));
  }

  protected next(): void {
    if (!this.currentStepValid()) {
      this.form.markAllAsTouched();
      return;
    }
    this.clicks.update((count) => count + 1);
    this.goToStep(this.currentStep() + 1);
  }

  protected back(): void {
    this.clicks.update((count) => count + 1);
    this.goToStep(this.currentStep() - 1);
  }

  /**
   * Moves on without charging a click, for choices that can only mean "and continue".
   * Guarded on the step still being the one that owns the choice, so a late-arriving
   * async result can't yank the user forward from somewhere else.
   */
  private autoAdvanceFrom(step: number): void {
    if (this.currentStep() === step) {
      this.goToStep(step + 1);
    }
  }

  // ─── Identity ────────────────────────────────────────────────────────────────
  protected selectUserType(type: UserType): void {
    if (this.userType() === type) {
      return;
    }
    this.clicks.update((count) => count + 1);
    this.form.controls.userType.setValue(type);
  }

  protected onDirectoryInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.directoryQuery.set(query);
    this.directorySearching.set(query.trim().length >= 2);
    this.usersService
      .searchDirectory(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        // Typing fires a request per keystroke, and nothing guarantees they resolve in
        // order — a slower earlier response would otherwise overwrite a newer one and
        // show results for a query the admin has already moved past. Only the response
        // matching what is currently in the box is allowed to land.
        if (this.directoryQuery() !== query) {
          return;
        }
        this.directoryResults.set(results);
        this.directorySearching.set(false);
      });
  }

  /** One click fills identity *and* seeds scope from the AD home region, then advances. */
  protected pickPerson(person: DirectoryPerson): void {
    this.clicks.update((count) => count + 1);
    this.pickedPerson.set(person);
    this.directoryResults.set([]);
    this.directoryQuery.set(person.name);
    this.form.patchValue({ name: person.name, email: person.email });
    if (this.selectedRegions().length === 0) {
      this.form.controls.regions.setValue([person.region]);
    }
    // Picking a person from the directory can only mean "this is the user" — there is
    // nothing else to decide on this step for an AD account, so move on for free.
    this.autoAdvanceFrom(0);
  }

  protected clearPerson(): void {
    this.pickedPerson.set(null);
    this.directoryQuery.set('');
    this.form.patchValue({ name: '', email: '' });
  }

  protected onDistributorInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    this.distributorQuery.set(query);
    this.usersService
      .searchDistributors(query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((results) => {
        // Same out-of-order guard as the directory search above.
        if (this.distributorQuery() !== query) {
          return;
        }
        this.distributorResults.set(results);
      });
  }

  protected pickDistributor(distributor: DistributorRecord): void {
    this.clicks.update((count) => count + 1);
    this.pickedDistributor.set(distributor);
    this.distributorResults.set([]);
    this.distributorQuery.set(distributor.name);
    this.form.patchValue({
      name: distributor.name,
      distributorCode: distributor.code,
      regions: [distributor.region],
      // KPO mailbox convention — editable, but right often enough to save the typing.
      email: `kpo.${distributor.code.toLowerCase()}@distributor.pk`,
    });
    // No auto-advance here: a distributor account still needs a city on this step, so
    // the choice is not yet complete. Advancing would hide a required field.
  }

  // ─── Access ──────────────────────────────────────────────────────────────────
  /** The one-click path: stamps roles + permissions, and scope when it isn't set yet. */
  protected applyTemplate(template: AccessTemplate): void {
    this.clicks.update((count) => count + 1);
    this.appliedTemplate.set(template);
    this.clonedFrom.set(null);
    this.form.patchValue({
      roles: [...template.roles],
      permissions: [...template.permissions],
    });
    // A template answers this whole step in one action, so advance for free. The admin
    // can step back and fine-tune; the matrix is still there when they do.
    this.autoAdvanceFrom(1);
  }

  /** Mirror an existing peer's access wholesale — roles, permissions and scope. */
  protected cloneFrom(user: AdminUser): void {
    this.clicks.update((count) => count + 1);
    this.clonedFrom.set(user);
    this.appliedTemplate.set(null);
    this.form.patchValue({
      roles: [...user.roles],
      permissions: [...user.permissions],
      regions: [...user.regions],
      brands: [...user.brands],
    });
    this.autoAdvanceFrom(1);
  }

  protected toggleRole(role: Role): void {
    this.clicks.update((count) => count + 1);
    const current = this.selectedRoles();
    const next = current.includes(role)
      ? current.filter((candidate) => candidate !== role)
      : [...current, role];
    this.form.controls.roles.setValue(next);
  }

  protected togglePermission(permission: string): void {
    this.clicks.update((count) => count + 1);
    const current = this.selectedPermissions();
    const next = current.includes(permission)
      ? current.filter((candidate) => candidate !== permission)
      : [...current, permission];
    this.form.controls.permissions.setValue(next);
  }

  // ─── Scope ───────────────────────────────────────────────────────────────────
  protected toggleRegion(region: string): void {
    this.clicks.update((count) => count + 1);
    const current = this.selectedRegions();
    const next = current.includes(region)
      ? current.filter((candidate) => candidate !== region)
      : [...current, region];
    this.form.controls.regions.setValue(next);
    // A city outside the remaining regions would be an invalid pairing, so drop it.
    if (!this.cityOptions().includes(this.form.controls.city.value)) {
      this.form.controls.city.setValue('');
    }
  }

  protected toggleBrand(brand: string): void {
    this.clicks.update((count) => count + 1);
    const current = this.selectedBrands();
    const next = current.includes(brand)
      ? current.filter((candidate) => candidate !== brand)
      : [...current, brand];
    this.form.controls.brands.setValue(next);
  }

  protected selectAllRegions(): void {
    this.clicks.update((count) => count + 1);
    this.form.controls.regions.setValue([...REGIONS]);
  }

  protected selectAllBrands(): void {
    this.clicks.update((count) => count + 1);
    this.form.controls.brands.setValue([...BRANDS]);
  }

  // ─── Submit ──────────────────────────────────────────────────────────────────
  protected submit(): void {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const raw = this.form.getRawValue();

    this.usersService
      .create({
        userType: raw.userType,
        name: raw.name,
        email: raw.email,
        roles: raw.roles,
        permissions: raw.permissions,
        regions: raw.regions,
        brands: raw.brands,
        endDate: raw.userType === 'temporary' ? raw.endDate : undefined,
        distributorCode: raw.userType === 'distributor' ? raw.distributorCode : undefined,
        city: raw.userType === 'distributor' ? raw.city : undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.submitting.set(false);
          // Land on a success state rather than bouncing straight back to the list. The
          // admin gets an explicit confirmation of exactly what was granted, and the two
          // things they are most likely to do next — provision another, or go review the
          // list — are one click away. The toast alone was too thin an acknowledgement
          // for an action that hands someone access to financial approvals.
          this.createdUser.set(user);
          const regionCount = user.regions.length;
          const regionText = `${regionCount} ${regionCount === 1 ? 'region' : 'regions'}`;
          this.notifications.success(
            `${user.name} provisioned with ${user.permissions.length} permissions across ${regionText}.`,
            'User created',
          );
        },
        error: (error: Error) => {
          this.submitting.set(false);
          this.notifications.error(error.message || 'Could not create that user.');
        },
      });
  }

  /**
   * Clears everything and returns to step 1, for provisioning a second user without a
   * round trip through the list. Onboarding a team happens in batches, so this is the
   * common case after a successful create, not an edge case.
   */
  protected provisionAnother(): void {
    this.createdUser.set(null);
    this.clicks.set(0);
    this.currentStep.set(0);
    this.furthestStep.set(0);
    this.appliedTemplate.set(null);
    this.clonedFrom.set(null);
    this.pickedPerson.set(null);
    this.pickedDistributor.set(null);
    this.directoryQuery.set('');
    this.directoryResults.set([]);
    this.distributorQuery.set('');
    this.distributorResults.set([]);
    this.form.reset({
      userType: 'ad',
      name: '',
      email: '',
      endDate: '',
      distributorCode: '',
      city: '',
      roles: [],
      permissions: [],
      regions: [],
      brands: [],
    });
  }

  /** Summary line on the success panel — the grant, restated once more, in full. */
  protected readonly createdSummary = computed(() => {
    const user = this.createdUser();
    if (!user) {
      return '';
    }
    const regions = user.regions.length;
    const regionText = `${regions} ${regions === 1 ? 'region' : 'regions'}`;
    const brandText = user.brands.length === 0 ? 'all brands' : `${user.brands.length} brands`;
    return `${user.permissions.length} permissions across ${regionText} and ${brandText}.`;
  });

  /**
   * Temporary accounts follow a naming convention rather than a person's name, e.g.
   * ASM_FSD_Lahore_FCBL (KT Meeting 2 §3). Generated from the current role and region
   * so the admin doesn't have to remember the pattern.
   */
  protected generateTempUsername(): void {
    this.clicks.update((count) => count + 1);
    const role = this.selectedRoles()[0] ?? 'USER';
    const region = this.selectedRegions()[0]?.replace(/\s+/g, '') ?? 'ALL';
    const username = `${role}_${region}_${TEMP_SUFFIX}`;
    this.form.patchValue({
      name: username,
      email: `${username.toLowerCase()}@frieslandcampina.com`,
    });
  }

  private onUserTypeChanged(type: UserType): void {
    // Switching type invalidates every downstream choice, so the wizard returns to the
    // start rather than leaving the user on a Scope step built from a template that no
    // longer applies to them.
    this.currentStep.set(0);
    this.furthestStep.set(0);
    this.appliedTemplate.set(null);
    this.clonedFrom.set(null);
    this.pickedPerson.set(null);
    this.pickedDistributor.set(null);
    this.directoryQuery.set('');
    this.directoryResults.set([]);
    this.distributorQuery.set('');
    this.distributorResults.set([]);
    // Deliberately NOT `{ emitEvent: false }`. The summary panel and the submit gate read
    // `form.valueChanges` / `form.statusChanges` through toSignal, so suppressing the
    // emission here would leave both showing the previous user type's access after a
    // switch. An extra emission is cheap; a stale access summary is a wrong grant.
    this.form.patchValue({
      name: '',
      email: '',
      endDate: '',
      distributorCode: '',
      city: '',
      roles: [],
      permissions: [],
      regions: [],
      brands: [],
    });

    // An end date is what makes a temporary account temporary — the nightly job reads it.
    // Enforce it as a hard requirement on that type only.
    const endDate = this.form.controls.endDate;
    endDate.setValidators(type === 'temporary' ? [Validators.required] : []);
    endDate.updateValueAndValidity();

    const distributorCode = this.form.controls.distributorCode;
    distributorCode.setValidators(type === 'distributor' ? [Validators.required] : []);
    distributorCode.updateValueAndValidity();

    const city = this.form.controls.city;
    city.setValidators(type === 'distributor' ? [Validators.required] : []);
    city.updateValueAndValidity();
  }
}
