import { Component, computed, input, output, signal } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../../../shared/icon-registry';
import {
  ACTION_LABELS,
  PERMISSION_MODULES,
  PermissionAction,
  PermissionModule,
} from '../models/admin-user.model';

// The per-screen permission grid, module × action — the legacy system's
// Initiate / Approve / View model made visible (KT Meeting 2 §1).
//
// Collapsed by default and deliberately framed as "fine-tune": an access template
// answers this correctly for almost every user, and presenting fourteen checkboxes as
// the primary path is exactly the friction the client asked to remove. It exists for the
// exceptions, and for the auditor who wants to see the grant explicitly.
//
// Extracted from the provisioning form so the forthcoming edit-user and role-definition
// screens can reuse it rather than fork a second grid.
@Component({
  selector: 'to-permission-matrix',
  standalone: true,
  imports: [TablerIconComponent],
  templateUrl: './permission-matrix.component.html',
  styleUrl: './permission-matrix.component.scss',
})
export class PermissionMatrixComponent {
  readonly permissions = input.required<readonly string[]>();
  readonly toggled = output<string>();

  protected readonly icons = ICON_REGISTRY;
  protected readonly modules = PERMISSION_MODULES;
  protected readonly actionLabels = ACTION_LABELS;

  /** Columns in escalating order of privilege, so the grid reads left-to-right as risk. */
  protected readonly actions: PermissionAction[] = ['view', 'create', 'approve', 'manage'];

  protected readonly open = signal(false);
  protected readonly count = computed(() => this.permissions().length);

  protected toggleOpen(): void {
    this.open.update((value) => !value);
  }

  protected permissionFor(module: PermissionModule, action: PermissionAction): string | undefined {
    return module.actions[action];
  }

  protected isOn(permission: string | undefined): boolean {
    return permission !== undefined && this.permissions().includes(permission);
  }

  protected onToggle(permission: string): void {
    this.toggled.emit(permission);
  }
}
