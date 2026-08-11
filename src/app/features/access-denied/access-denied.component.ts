import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TablerIconComponent } from '@tabler/icons-angular';

import { ICON_REGISTRY } from '../../shared/icon-registry';

@Component({
  selector: 'to-access-denied',
  standalone: true,
  imports: [RouterLink, ButtonModule, TablerIconComponent],
  templateUrl: './access-denied.component.html',
  styleUrl: './access-denied.component.scss',
})
export class AccessDeniedComponent {
  protected readonly icons = ICON_REGISTRY;
}
