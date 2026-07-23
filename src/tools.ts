/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Each function is registered as an MCP tool in index.ts.
 *
 * This separation makes tools easy to unit test without MCP infrastructure.
 */

import { getAuditLists, getCachedListRecords, getListStatus, getPool } from './cache.js';
import { MATCH_METHOD_DESCRIPTION } from './core/auditSummary.js';
import { buildCertificatePdf } from './core/certificate.js';
import { collectCsvString, exportToJson, exportToXlsx } from './core/exportList.js';
import { diffScreeningRuns } from './core/monitor.js';
import { parseSubjectsInput } from './core/parseSubjects.js';
import { screenSubjects } from './core/screening.js';
import { SOURCES } from './core/sources/index.js';
import type { ExportFormat, ListStatusEntry, ScreenOptions, ScreeningSummaryRecord } from './core/types.js';
import type { ExportToolInput, MonitorToolInput, ScreenToolInput, ScreenToolOptions } from './types.js';

const DEFAULT_THRESHOLD = 85;
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

function resolveScreenOptions(options: ScreenToolOptions): ScreenOptions {
    return {
        entityType: options.entityType ?? 'any',
        threshold: clamp(Math.trunc(options.threshold ?? DEFAULT_THRESHOLD), 0, 100),
        fuzzy: options.fuzzy ?? true,
        lists: options.lists,
        whitelist: options.whitelist ?? [],
    };
}

export interface ScreenEntityResult {
    [key: string]: unknown;
    results: ScreeningSummaryRecord[];
    certificatePdfBase64?: string;
}

// Screens every subject against the in-memory 5-list cache (see
// core/sources/index.ts for why OpenSanctions is Apify-only). Blank names
// are returned with no lookup performed, not silently dropped.
export async function screenEntity(input: ScreenToolInput): Promise<ScreenEntityResult> {
    const subjects = await parseSubjectsInput({ subjects: input.subjects });
    const options = resolveScreenOptions(input);
    const results = screenSubjects(subjects, getPool(), options);

    let certificatePdfBase64: string | undefined;
    if (input.generateCertificate) {
        const pdf = await buildCertificatePdf(results, {
            lists: getAuditLists(),
            threshold: options.threshold,
            fuzzy: options.fuzzy,
            matchMethod: MATCH_METHOD_DESCRIPTION,
        });
        certificatePdfBase64 = Buffer.from(pdf).toString('base64');
    }

    return { results, ...(certificatePdfBase64 ? { certificatePdfBase64 } : {}) };
}

export interface MonitorChangesResult {
    [key: string]: unknown;
    changedCount: number;
    unchangedCount: number;
    changes: ReturnType<typeof diffScreeningRuns>['changes'];
    checkedAt: string;
}

// Re-screens `subjects` against the fresh in-memory cache and diffs against
// `previousResults` (the caller's own copy of a prior screen_entity or
// monitor_changes "results" array - this server has no per-caller run
// history to key a "prior run id" against, unlike the Apify actor).
export async function monitorChanges(input: MonitorToolInput): Promise<MonitorChangesResult> {
    const subjects = await parseSubjectsInput({ subjects: input.subjects });
    const options = resolveScreenOptions(input);
    const current = screenSubjects(subjects, getPool(), options);
    const previous = input.previousResults as ScreeningSummaryRecord[];

    const result = diffScreeningRuns(Array.isArray(previous) ? previous : [], current);
    return { changedCount: result.changedCount, unchangedCount: result.unchangedCount, changes: result.changes, checkedAt: result.checkedAt };
}

export interface ExportListResult {
    [key: string]: unknown;
    list: string;
    format: ExportFormat;
    recordCount: number;
    csv?: string;
    json?: unknown[];
    xlsxBase64?: string;
}

export async function exportList(input: ExportToolInput): Promise<ExportListResult> {
    const format: ExportFormat = input.format ?? 'csv';
    const records = getCachedListRecords(input.list);
    if (!records) {
        throw new Error(`List "${input.list}" is not cached (unknown list or a fetch has not completed yet).`);
    }

    if (format === 'json') {
        return { list: input.list, format, recordCount: records.length, json: await exportToJson(records) };
    }
    if (format === 'xlsx') {
        const buffer = await exportToXlsx(records);
        return { list: input.list, format, recordCount: records.length, xlsxBase64: buffer.toString('base64') };
    }
    return { list: input.list, format, recordCount: records.length, csv: await collectCsvString(records) };
}

export interface ListStatusResult {
    [key: string]: unknown;
    lists: ListStatusEntry[];
}

// Reports each official list's cached record count and last-refresh time, so
// callers can confirm data freshness before relying on a screening result.
export function listStatus(): ListStatusResult {
    return { lists: getListStatus() };
}

export const AVAILABLE_LISTS = SOURCES.map((s) => s.list);
