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

  // ─── Compact forms — dashboard tiles and chart labels only ───────────────────
  // Full-precision figures stay the rule everywhere a user reconciles a number
  // (tables, forms, approval detail). Compact is for at-a-glance overview surfaces
  // where "PKR 41.2M" beats "PKR 41,200,000" for scannability.
  //
  // Grouping follows the international M/K convention, not lakh/crore, to stay
  // consistent with the locked `1,000,000` format in CLAUDE.md §5.

  /** e.g. 1840000 -> "1.8M", 640000 -> "640K", 820 -> "820" */
  formatCompact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) {
      return `${this.trimZero(value / 1_000_000)}M`;
    }
    if (abs >= 1_000) {
      return `${this.trimZero(value / 1_000)}K`;
    }
    return this.numberFormatter.format(value);
  }

  /** e.g. 41200000 -> "PKR 41.2M" */
  formatPkrCompact(value: number): string {
    return `PKR ${this.formatCompact(value)}`;
  }

  /** One decimal, but drop it when it is a trailing zero: 1.0 -> "1", 1.8 -> "1.8". */
  private trimZero(value: number): string {
    const rounded = Math.round(value * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  }

  /** Sign for +/- colouring on to-number. */
  signOf(value: number): 'positive' | 'negative' | 'neutral' {
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }
}
