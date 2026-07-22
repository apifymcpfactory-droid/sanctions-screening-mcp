// Parser for the UK OFSI Consolidated List of Financial Sanctions Targets,
// published as CSV. Each underlying person/entity appears as several rows
// (one per name variation/AKA/FKA) sharing the same "Group ID" - we group
// rows back into one record per Group ID before returning.

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

function mapEntityType(groupType: string | undefined): RecordEntityType {
    if (groupType === 'Individual') return 'person';
    if (groupType === 'Entity') return 'org';
    return 'other';
}

// UK OFSI orders given names 1-5 first with the surname (Name 6) last, e.g.
// Name1="Mian" Name2="Abdul" Name6="HAQ" -> "Mian Abdul HAQ". Entities carry
// their whole name in Name 6 alone, so the same join works for both.
function buildName(fields: string[]): string {
    return [
        fields[COL.name1],
        fields[COL.name2],
        fields[COL.name3],
        fields[COL.name4],
        fields[COL.name5],
        fields[COL.name6],
    ]
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

    const groups = new Map<string, string[][]>();
    for (const line of lines) {
        const fields = parseCsvLine(line);
        const groupId = fields[COL.groupId];
        if (!groupId) continue;
        const rows = groups.get(groupId) ?? [];
        rows.push(fields);
        groups.set(groupId, rows);
    }

    const records: SanctionRecord[] = [];
    for (const [groupId, rows] of groups) {
        const primaryRow = rows.find((row) => row[COL.aliasType] === 'Primary name') ?? rows[0];
        const primaryName = buildName(primaryRow) || 'Unknown';
        const aliases = [...new Set(rows.map(buildName).filter((name) => name.length > 0 && name !== primaryName))];

        records.push({
            entityId: `UK OFSI-${groupId}`,
            list: 'UK OFSI',
            program: primaryRow[COL.regime] || 'Unspecified',
            entityType: mapEntityType(primaryRow[COL.groupType]),
            primaryName,
            aliases,
            country: primaryRow[COL.country] || undefined,
            details: primaryRow[COL.otherInformation]?.slice(0, MAX_DETAILS_LENGTH),
        });
    }
    return records;
}

export async function fetchUkList(): Promise<SanctionRecord[]> {
    const csv = await fetchListFile(UK_LIST_URL);
    return parseUkCsv(csv);
}
