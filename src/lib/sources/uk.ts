// Parser for the UK OFSI Consolidated List of Financial Sanctions Targets,
// published as CSV. Each underlying person/entity appears as several rows
// (one per name variation/AKA/FKA) sharing the same "Group ID" - we group
// rows back into one record per Group ID before returning.
//
// Only ~11 of the source's 36 columns are ever used, so each row is reduced
// to just those immediately after splitting rather than keeping the full
// 36-field array around for all ~20,000 rows until grouping finishes - that
// full-width retention was the single largest memory cost of the 5 lists.

import type { RecordEntityType, SanctionRecord } from '../../types.js';
import { parseCsvLine } from '../csv.js';
import { fetchListFile } from '../http.js';

export const UK_LIST_URL = 'https://ofsistorage.blob.core.windows.net/publishlive/2022format/ConList.csv';

const MAX_DETAILS_LENGTH = 300;

const COL = {
    name6: 0,
    name1: 1,
    name2: 2,
    name3: 3,
    name4: 4,
    name5: 5,
    country: 26,
    otherInformation: 27,
    groupType: 28,
    aliasType: 29,
    regime: 31,
    groupId: 35,
} as const;

interface UkRow {
    name1: string;
    name2: string;
    name3: string;
    name4: string;
    name5: string;
    name6: string;
    country: string;
    otherInformation: string;
    groupType: string;
    aliasType: string;
    regime: string;
}

function extractRow(fields: string[]): UkRow {
    return {
        name1: fields[COL.name1] ?? '',
        name2: fields[COL.name2] ?? '',
        name3: fields[COL.name3] ?? '',
        name4: fields[COL.name4] ?? '',
        name5: fields[COL.name5] ?? '',
        name6: fields[COL.name6] ?? '',
        country: fields[COL.country] ?? '',
        otherInformation: fields[COL.otherInformation] ?? '',
        groupType: fields[COL.groupType] ?? '',
        aliasType: fields[COL.aliasType] ?? '',
        regime: fields[COL.regime] ?? '',
    };
}

function mapEntityType(groupType: string | undefined): RecordEntityType {
    if (groupType === 'Individual') return 'person';
    if (groupType === 'Entity') return 'org';
    return 'other';
}

// UK OFSI orders given names 1-5 first with the surname (Name 6) last, e.g.
// Name1="Mian" Name2="Abdul" Name6="HAQ" -> "Mian Abdul HAQ". Entities carry
// their whole name in Name 6 alone, so the same join works for both.
function buildName(row: UkRow): string {
    return [row.name1, row.name2, row.name3, row.name4, row.name5, row.name6]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(' ');
}

// Row 0 of the CSV is a "Last Updated,<date>" stamp, row 1 is the real header.
export function parseUkCsv(csv: string): SanctionRecord[] {
    const lines = csv
        .split(/\r?\n/)
        .slice(2)
        .filter((line) => line.trim().length > 0);

    const groups = new Map<string, UkRow[]>();
    for (const line of lines) {
        const fields = parseCsvLine(line);
        const groupId = fields[COL.groupId];
        if (!groupId) continue;
        const rows = groups.get(groupId) ?? [];
        rows.push(extractRow(fields));
        groups.set(groupId, rows);
    }

    const records: SanctionRecord[] = [];
    for (const [groupId, rows] of groups) {
        const primaryRow = rows.find((row) => row.aliasType === 'Primary name') ?? rows[0];
        const primaryName = buildName(primaryRow) || 'Unknown';
        const aliases = [...new Set(rows.map(buildName).filter((name) => name.length > 0 && name !== primaryName))];

        records.push({
            entityId: `UK OFSI-${groupId}`,
            list: 'UK OFSI',
            program: primaryRow.regime || 'Unspecified',
            entityType: mapEntityType(primaryRow.groupType),
            primaryName,
            aliases,
            country: primaryRow.country || undefined,
            details: primaryRow.otherInformation?.slice(0, MAX_DETAILS_LENGTH),
        });
    }
    return records;
}

export async function fetchUkList(): Promise<SanctionRecord[]> {
    const csv = await fetchListFile(UK_LIST_URL);
    return parseUkCsv(csv);
}
