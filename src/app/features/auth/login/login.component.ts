import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { AuthService } from '../../../core/services/auth.service';
import { ROLE_LABELS, Role } from '../../../core/models/role.model';

// Foundation-phase stub. CLAUDE.md §3 specifies the real login screen as a
// branded split-panel with "Sign in with Friesland Campina" — that's Phase 1
// item #1. This stub exists only so PermissionGuard has somewhere to redirect
// to and the shell is reachable during Phase 0 verification.
@Component({
  selector: 'to-login',
  standalone: true,
  imports: [ButtonModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly roles = this.authService.availableRoles;

  loginAs(role: Role): void {
    this.authService.loginAs(role);
    this.router.navigateByUrl('/dashboard');
  }
}
