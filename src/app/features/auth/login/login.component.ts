import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';

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

  protected readonly useMocks = environment.useMocks;

  signIn(): void {
    // Mock auth: signs in as the first available role. Real OIDC flow (Keycloak
    // or Entra ID, CLAUDE.md §3) replaces this call without touching the template.
    const [defaultRole] = this.authService.availableRoles;
    if (defaultRole) {
      this.authService.loginAs(defaultRole);
    }
    this.router.navigateByUrl('/dashboard');
  }
}
