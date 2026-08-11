import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 1000 * 60 * 60 * 24 * 365],
  ['month', 1000 * 60 * 60 * 24 * 30],
  ['week', 1000 * 60 * 60 * 24 * 7],
  ['day', 1000 * 60 * 60 * 24],
  ['hour', 1000 * 60 * 60],
  ['minute', 1000 * 60],
];

@Pipe({ name: 'relativeDate' })
export class RelativeDatePipe implements PipeTransform {
  private readonly formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  transform(value: Date | string | null | undefined): string {
    if (!value) {
      return '—';
    }

    const date = value instanceof Date ? value : new Date(value);
    const diffMs = date.getTime() - Date.now();

    for (const [unit, unitMs] of UNITS) {
      if (Math.abs(diffMs) >= unitMs) {
        return this.formatter.format(Math.round(diffMs / unitMs), unit);
      }
    }
    return this.formatter.format(Math.round(diffMs / 1000), 'second');
  }
}
