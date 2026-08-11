import { Component, computed, signal, input, output } from '@angular/core';
import { TablerIconComponent } from '@tabler/icons-angular';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';

import { ICON_REGISTRY } from '../../icon-registry';

export interface BulkUploadColumn {
  key: string;
  header: string;
  /** Returns an error message, or null when the value is valid. No hardcoded
   *  business rules live in this component — callers (e.g. the Scheme bulk upload
   *  screen) configure discount-column / liter-column validators per CLAUDE.md §8. */
  validator?: (value: unknown, row: Record<string, unknown>) => string | null;
}

export interface BulkUploadRowResult {
  rowIndex: number;
  data: Record<string, unknown>;
  errors: string[];
}

type BulkUploadState = 'idle' | 'parsing' | 'preview' | 'submitting' | 'done';

interface ParsedRow {
  rowIndex: number;
  data: Record<string, unknown>;
  cellErrors: Record<string, string>;
}

// Generic Excel/CSV bulk-upload flow: dropzone → client-side preview (with per-cell
// validation) → submit → backend validation → done summary (CLAUDE.md §8/§9). No
// feature-specific logic — column definitions and validators are entirely caller-supplied.
@Component({
  selector: 'to-bulk-uploader',
  standalone: true,
  imports: [TableModule, TooltipModule, TablerIconComponent],
  templateUrl: './bulk-uploader.component.html',
  styleUrl: './bulk-uploader.component.scss',
})
export class BulkUploaderComponent {
  readonly columns = input.required<BulkUploadColumn[]>();

  // Emitted when the user clicks Submit in the preview stage. CLAUDE.md §8 describes
  // the flow as "client-side preview → backend validation → error display per row →
  // verified submit" — read as: client-side validation is a first pass/UX aid, not a
  // hard gate. Submit stays enabled even when rows show client-side errors; the
  // backend remains the source of truth for final acceptance/rejection. Row/cell
  // errors stay visibly highlighted throughout so nothing is submitted blind.
  // Name is spec-mandated (`submit`) even though it shadows the native DOM event —
  // there's no ambiguity in practice since Angular output bindings are `(submit)`
  // template syntax, distinct from a native `submit` event listener.
  // eslint-disable-next-line @angular-eslint/no-output-native -- spec-mandated name
  readonly submit = output<BulkUploadRowResult[]>();

  protected readonly state = signal<BulkUploadState>('idle');
  protected readonly isDragOver = signal(false);
  protected readonly fileName = signal<string | null>(null);
  protected readonly parseError = signal<string | null>(null);
  protected readonly parsedRows = signal<ParsedRow[]>([]);
  protected readonly finalResults = signal<BulkUploadRowResult[]>([]);

  protected readonly uploadIcon = ICON_REGISTRY['cloud-upload'];
  protected readonly fileIcon = ICON_REGISTRY['file-spreadsheet'];
  protected readonly alertIcon = ICON_REGISTRY['alert-triangle'];
  protected readonly successIcon = ICON_REGISTRY['circle-check'];
  protected readonly refreshIcon = ICON_REGISTRY['refresh'];

  protected readonly errorRowCount = computed(
    () => this.parsedRows().filter((row) => Object.keys(row.cellErrors).length > 0).length,
  );

  protected readonly rowResults = computed<BulkUploadRowResult[]>(() =>
    this.parsedRows().map((row) => ({
      rowIndex: row.rowIndex,
      data: row.data,
      errors: Object.values(row.cellErrors),
    })),
  );

  protected readonly successCount = computed(
    () => this.finalResults().filter((row) => row.errors.length === 0).length,
  );
  protected readonly failureCount = computed(
    () => this.finalResults().filter((row) => row.errors.length > 0).length,
  );

  protected hasRowErrors(row: ParsedRow): boolean {
    return Object.keys(row.cellErrors).length > 0;
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      void this.parseFile(file);
    }
  }

  protected onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.parseFile(file);
    }
    // Allow re-selecting the same filename later (e.g. after fixing and re-exporting).
    input.value = '';
  }

  // [PENDING: Excel parsing lib (e.g. xlsx/sheetjs) not yet installed — parseFile()
  // below is a stub that must be replaced when this component is wired to a real
  // upload flow.] For now, .csv gets a minimal client-side parse (split on
  // newlines/commas — adequate for MVP demo, not RFC-4180-perfect: it will not
  // handle quoted fields containing commas) so the preview stage is demonstrable
  // end-to-end today. .xlsx/.xls are accepted by the dropzone (so the UI shape
  // won't change later) but just surface a friendly "coming in Phase 1" message.
  private async parseFile(file: File): Promise<void> {
    this.parseError.set(null);
    this.fileName.set(file.name);
    this.state.set('parsing');

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

    if (extension !== 'csv') {
      this.parseError.set(
        'Excel (.xlsx/.xls) parsing will be wired in Phase 1. Upload a .csv file to preview this flow today.',
      );
      this.state.set('idle');
      return;
    }

    const text = await file.text();
    const rawRows = this.parseCsv(text);
    this.parsedRows.set(rawRows.map((data, index) => this.validateRow(data, index)));
    this.state.set('preview');
  }

  private parseCsv(text: string): Record<string, unknown>[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
      return [];
    }
    const headers = lines[0].split(',').map((header) => header.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(',');
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = cells[index]?.trim() ?? '';
      });
      return row;
    });
  }

  private validateRow(data: Record<string, unknown>, rowIndex: number): ParsedRow {
    const cellErrors: Record<string, string> = {};
    for (const column of this.columns()) {
      if (!column.validator) {
        continue;
      }
      const message = column.validator(data[column.key], data);
      if (message) {
        cellErrors[column.key] = message;
      }
    }
    return { rowIndex, data, cellErrors };
  }

  protected handleSubmit(): void {
    this.state.set('submitting');
    this.submit.emit(this.rowResults());
  }

  // Called by the parent once backend validation finishes (this component never owns
  // the HTTP call — CLAUDE.md §3: feature services own HTTP, never the component).
  completeSubmission(results: BulkUploadRowResult[]): void {
    this.finalResults.set(results);
    this.state.set('done');
  }

  reset(): void {
    this.state.set('idle');
    this.isDragOver.set(false);
    this.fileName.set(null);
    this.parseError.set(null);
    this.parsedRows.set([]);
    this.finalResults.set([]);
  }
}
