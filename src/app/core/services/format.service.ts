import { Injectable } from '@angular/core';

// PKR formatting + tabular number display (CLAUDE.md §5 Number & Currency Formatting).
// All PKR amounts are integers — no paise, no decimal places.
@Injectable({ providedIn: 'root' })
export class FormatService {
  private readonly numberFormatter = new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 0,
  });

  private readonly percentFormatter = new Intl.NumberFormat('en-PK', {
    maximumFractionDigits: 1,
  });

  /** e.g. 1000000 -> "1,000,000" */
  formatNumber(value: number): string {
    return this.numberFormatter.format(value);
  }

  /** e.g. 1000000 -> "PKR 1,000,000" — never "Rs." or "₨". */
  formatPkr(value: number): string {
    return `PKR ${this.numberFormatter.format(Math.round(value))}`;
  }

  /** e.g. 12.5 -> "12.5%" */
  formatPercent(value: number): string {
    return `${this.percentFormatter.format(value)}%`;
  }

  /** Sign for +/- colouring on to-number. */
  signOf(value: number): 'positive' | 'negative' | 'neutral' {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }
}
