import { Directive, TemplateRef, inject, input } from '@angular/core';

// Lets a caller override the default cell rendering of to-data-table for a specific
// column, so real screens can drop in status pills, pipeline stages, action buttons, etc.
// Usage:
//   <to-data-table [columns]="cols" [rows]="rows">
//     <ng-template toCellTemplate="status" let-row>
//       <to-status-pill [status]="row.status" />
//     </ng-template>
//   </to-data-table>
// The template context exposes the row as $implicit and the column as `column`.
@Directive({
  selector: '[toCellTemplate]',
  standalone: true,
})
export class CellTemplateDirective {
  readonly toCellTemplate = input.required<string>();
  readonly templateRef = inject<TemplateRef<unknown>>(TemplateRef);
}
