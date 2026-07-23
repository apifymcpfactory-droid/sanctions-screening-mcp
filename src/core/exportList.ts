// Export mode: dump one official/aggregated list as clean structured data.
// CSV export streams row-by-row regardless of whether the input is already
// a materialised array or a live generator, so a caller that keeps its
// cache as an async source never has to fully realise it just to export it.
// JSON and XLSX are built as one in-memory structure (ExcelJS and
// JSON.stringify both need the whole structure) - fine for the four
// government lists (tens of thousands of rows at most) but sized
// appropriately with the OpenSanctions record cap already applied upstream
// (see sources/openSanctions.ts).

import ExcelJS from 'exceljs';

import type { ExportFormat, NormalizedEntity } from './types.js';

const CSV_COLUMNS: Array<keyof NormalizedEntity> = [
    'entityId', 'name', 'aliases', 'type', 'dob', 'dobYear', 'countries', 'nationalities',
    'identifiers', 'programs', 'sourceList', 'listVersion', 'linkedTo', 'digitalCurrencyAddresses', 'details',
];

function csvEscape(value: unknown): string {
    if (value === undefined || value === null) return '';
    const text = Array.isArray(value) ? value.join('; ') : String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
}

export async function* exportToCsvLines(entities: AsyncIterable<NormalizedEntity> | Iterable<NormalizedEntity>): AsyncGenerator<string> {
    yield CSV_COLUMNS.join(',');
    for await (const entity of entities) {
        yield CSV_COLUMNS.map((col) => csvEscape(entity[col])).join(',');
    }
}

export async function exportToJson(entities: AsyncIterable<NormalizedEntity> | Iterable<NormalizedEntity>): Promise<NormalizedEntity[]> {
    const rows: NormalizedEntity[] = [];
    for await (const entity of entities) rows.push(entity);
    return rows;
}

export async function exportToXlsx(entities: AsyncIterable<NormalizedEntity> | Iterable<NormalizedEntity>): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Export');
    sheet.columns = CSV_COLUMNS.map((col) => ({ header: col, key: col }));

    for await (const entity of entities) {
        const row: Record<string, string> = {};
        for (const col of CSV_COLUMNS) {
            const value = entity[col];
            row[col] = Array.isArray(value) ? value.join('; ') : value !== undefined && value !== null ? String(value) : '';
        }
        sheet.addRow(row);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return buffer as unknown as Buffer;
}

export async function collectCsvString(entities: AsyncIterable<NormalizedEntity> | Iterable<NormalizedEntity>): Promise<string> {
    const lines: string[] = [];
    for await (const line of exportToCsvLines(entities)) lines.push(line);
    return lines.join('\n');
}

export function exportFormatFromString(value: string | undefined): ExportFormat {
    if (value === 'json' || value === 'xlsx') return value;
    return 'csv';
}
