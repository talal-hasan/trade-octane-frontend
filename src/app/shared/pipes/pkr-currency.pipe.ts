import { Pipe, PipeTransform, inject } from '@angular/core';

import { FormatService } from '../../core/services/format.service';

@Pipe({ name: 'pkrCurrency' })
export class PkrCurrencyPipe implements PipeTransform {
  private readonly formatService = inject(FormatService);

  transform(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }
    return this.formatService.formatPkr(value);
  }
}
