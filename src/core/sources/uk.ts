// Parser for the UK OFSI Consolidated List of Financial Sanctions Targets,
// published as CSV. Each underlying person/entity appears as several rows
// (one per name variation/AKA/FKA) sharing the same "Group ID" - rows are
// grouped back into one record per Group ID before being emitted. The file
// itself is only a few MB (unlike the OFAC/EU/OpenSanctions exports), so
// briefly holding its rows grouped by ID is not a memory concern; only the
// raw file text is streamed rather than buffered whole.
//
// Column indices below are load-bearing on OFSI's current export layout and
// were verified against the live, already-deployed parser this replaces;
// DOB and national-identifier columns are not mapped here since their exact
// positions were not independently re-verified in this change - screening
// still works on name/country/programme/entity-type as before.

import { streamTextChunks } from '../http.js';
import type { EntityType, NormalizedEntity } from '../types.js';
import { iterateCsvLines, parseCsvLine } from '../csv.js';

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

function mapEntityType(groupType: string | undefined): EntityType {
    if (groupType === 'Individual') return 'person';
    if (groupType === 'Entity') return 'org';
    return 'other';
}

// UK OFSI orders given names 1-5 first with the surname (Name 6) last, e.g.
// Name1="Mian" Name2="Abdul" Name6="HAQ" -> "Mian Abdul HAQ". Entities carry
// their whole name in Name 6 alone, so the same join works for both.
function buildName(fields: string[]): string {
    return [fields[COL.name1], fields[COL.name2], fields[COL.name3], fields[COL.name4], fields[COL.name5], fields[COL.name6]]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(' ');
}

export async function* fetchUkList(): AsyncGenerator<NormalizedEntity> {
    const listVersion = new Date().toISOString();
    const groups = new Map<string, string[][]>();

    let lineIndex = 0;
    for await (const line of iterateCsvLines(streamTextChunks(UK_LIST_URL))) {
        lineIndex++;
        // Row 0 is a "Last Updated,<date>" stamp, row 1 is the real header.
        if (lineIndex <= 2 || line.trim().length === 0) continue;
        const fields = parseCsvLine(line);
        const groupId = fields[COL.groupId];
        if (!groupId) continue;
        const rows = groups.get(groupId) ?? [];
        rows.push(fields);
        groups.set(groupId, rows);
    }

    for (const [groupId, rows] of groups) {
        const primaryRow = rows.find((row) => row[COL.aliasType] === 'Primary name') ?? rows[0];
        const primaryName = buildName(primaryRow) || 'Unknown';
        const aliases = [...new Set(rows.map(buildName).filter((name) => name.length > 0 && name !== primaryName))];
        const countries = [...new Set(rows.map((row) => row[COL.country]).filter((c): c is string => Boolean(c)))];

        yield {
            entityId: `UK OFSI-${groupId}`,
            name: primaryName,
            aliases,
            type: mapEntityType(primaryRow[COL.groupType]),
            countries,
            nationalities: [],
            identifiers: [],
            programs: primaryRow[COL.regime] ? [primaryRow[COL.regime]] : ['Unspecified'],
            sourceList: 'UK OFSI',
            sourceUrl: UK_LIST_URL,
            listVersion,
            linkedTo: [],
            digitalCurrencyAddresses: [],
            details: primaryRow[COL.otherInformation]?.slice(0, MAX_DETAILS_LENGTH) || undefined,
        };
    }
}
