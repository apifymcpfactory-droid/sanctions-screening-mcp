// Accepts subjects in whatever shape the caller has on hand: an array of
// structured objects, an array of plain name strings, a pasted block of text
// (one name per line, or a CSV with a header row), or CSV/XLSX bytes fetched
// from a URL. Always normalises down to Subject[].

import ExcelJS from 'exceljs';

import { parseCsvLine } from './csv.js';
import { USER_AGENT } from './http.js';
import type { EntityTypeFilter, Subject } from './types.js';

export type SubjectRow = Subject | string;

export interface SubjectsInput {
    subjects?: SubjectRow[];
    subjectsText?: string;
    subjectsFileUrl?: string;
}

const CSV_HEADER_FIELDS = new Set([
    'name', 'entitytype', 'yearofbirth', 'dob', 'country', 'nationality', 'idnumber', 'passport', 'regnumber', 'lei', 'program',
]);

function normalizeHeader(cell: string): string {
    return cell.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function looksLikeCsvHeader(line: string): boolean {
    const cells = parseCsvLine(line).map(normalizeHeader);
    return cells.some((c) => CSV_HEADER_FIELDS.has(c));
}

function rowFromCsvCells(header: string[], cells: string[]): Subject | null {
    const row: Record<string, string> = {};
    header.forEach((col, i) => {
        if (cells[i] !== undefined && cells[i] !== '') row[col] = cells[i];
    });
    if (!row.name) return null;

    const subject: Subject = { name: row.name };
    if (row.entitytype) subject.entityType = row.entitytype as EntityTypeFilter;
    if (row.yearofbirth) subject.yearOfBirth = Number(row.yearofbirth) || undefined;
    if (row.dob) subject.dob = row.dob;
    if (row.country) subject.country = row.country;
    if (row.nationality) subject.nationality = row.nationality;
    if (row.idnumber) subject.idNumber = row.idnumber;
    if (row.passport) subject.passport = row.passport;
    if (row.regnumber) subject.regNumber = row.regnumber;
    if (row.lei) subject.lei = row.lei;
    if (row.program) subject.program = row.program;
    return subject;
}

function parseCsvText(text: string): Subject[] {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];

    if (!looksLikeCsvHeader(lines[0])) {
        // Not a CSV - treat every non-blank line as a plain subject name.
        return lines.map((line) => ({ name: line.trim() })).filter((s) => s.name.length > 0);
    }

    const header = parseCsvLine(lines[0]).map(normalizeHeader);
    const subjects: Subject[] = [];
    for (const line of lines.slice(1)) {
        const row = rowFromCsvCells(header, parseCsvLine(line));
        if (row) subjects.push(row);
    }
    return subjects;
}

async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<Subject[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) return [];

    let header: string[] = [];
    const subjects: Subject[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const cells = (row.values as unknown[]).slice(1).map((v) => (v === null || v === undefined ? '' : String(v)));
        if (rowNumber === 1) {
            header = cells.map(normalizeHeader);
            return;
        }
        const parsed = rowFromCsvCells(header, cells);
        if (parsed) subjects.push(parsed);
    });
    return subjects;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
    return response.arrayBuffer();
}

function subjectRowToSubject(row: SubjectRow): Subject {
    return typeof row === 'string' ? { name: row.trim() } : row;
}

export async function parseSubjectsInput(input: SubjectsInput): Promise<Subject[]> {
    const collected: Subject[] = [];

    if (input.subjects?.length) {
        collected.push(...input.subjects.map(subjectRowToSubject).filter((s) => s.name?.trim().length > 0));
    }

    if (input.subjectsText?.trim()) {
        collected.push(...parseCsvText(input.subjectsText));
    }

    if (input.subjectsFileUrl) {
        const isXlsx = /\.xlsx($|\?)/i.test(input.subjectsFileUrl);
        if (isXlsx) {
            const bytes = await fetchBytes(input.subjectsFileUrl);
            collected.push(...(await parseXlsxBuffer(bytes)));
        } else {
            const bytes = await fetchBytes(input.subjectsFileUrl);
            collected.push(...parseCsvText(new TextDecoder('utf-8').decode(bytes)));
        }
    }

    return collected;
}
