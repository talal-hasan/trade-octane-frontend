import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

// Thin wrapper over PrimeNG's MessageService so callers (error.interceptor.ts,
// feature services) never depend on PrimeNG's API shape directly.
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly messageService = inject(MessageService);

  success(detail: string, summary = 'Success'): void {
    this.messageService.add({ severity: 'success', summary, detail, life: 4000 });
  }

  info(detail: string, summary = 'Info'): void {
    this.messageService.add({ severity: 'info', summary, detail, life: 4000 });
  }

  warn(detail: string, summary = 'Warning'): void {
    this.messageService.add({ severity: 'warn', summary, detail, life: 5000 });
  }

  error(detail: string, summary = 'Error'): void {
    this.messageService.add({ severity: 'error', summary, detail, life: 6000 });
  }
}
