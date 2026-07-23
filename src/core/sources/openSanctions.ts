// Parser for OpenSanctions' public bulk "simple CSV" exports
// (https://www.opensanctions.org/docs/bulk/), used here for two collections:
// "sanctions" (aggregated international sanctions/watchlists beyond the
// OFAC/EU/UK/UN feeds parsed directly elsewhere - e.g. Switzerland SECO,
// Australia DFAT, Canada, Japan, INTERPOL Red Notices) and "peps" (politically
// exposed persons). Deliberately NOT the "default" collection - that bundle
// also mixes in law-enforcement and procurement-debarment datasets outside
// this tool's sanctions/PEP screening scope, and is ~2.5x the combined size
// of sanctions+peps for no screening benefit here.
//
// These files are large (sanctions ~65MB, peps ~190MB at last check) and are
// streamed and parsed one CSV row at a time - never buffered whole, and
// never held as raw text once turned into a NormalizedEntity. A hard cap on
// records kept per collection is enforced (see OPENSANCTIONS_MAX_RECORDS)
// purely as a memory-safety backstop for a memory-constrained container;
// when the cap is hit, the caller sees exactly how many rows were skipped so
// this is never silently under-reported.

import { streamTextChunks } from '../http.js';
import { iterateCsvLines, parseCsvLine } from '../csv.js';
import type { EntityType, ListName, NormalizedEntity } from '../types.js';

export const OPENSANCTIONS_SANCTIONS_URL = 'https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv';
export const OPENSANCTIONS_PEPS_URL = 'https://data.opensanctions.org/datasets/latest/peps/targets.simple.csv';

// Overridable via env for anyone who wants more/less recall vs. memory
// headroom; the default is a conservative number of normalized-record
// objects (each a few hundred bytes) that stays well under typical Apify/
// MCPize container memory limits even added on top of the other 5 lists.
export const OPENSANCTIONS_MAX_RECORDS = Number(process.env.OPENSANCTIONS_MAX_RECORDS) || 150_000;

const COLUMNS = [
    'id', 'schema', 'name', 'aliases', 'birth_date', 'countries', 'addresses',
    'identifiers', 'sanctions', 'phones', 'emails', 'program_ids', 'dataset',
    'first_seen', 'last_seen', 'last_change',
] as const;
type Column = (typeof COLUMNS)[number];

function splitMulti(value: string | undefined): string[] {
    if (!value) return [];
    return value.split(';').map((v) => v.trim()).filter(Boolean);
}

function mapEntityType(schema: string | undefined): EntityType {
    if (schema === 'Person') return 'person';
    if (schema === 'Company' || schema === 'Organization' || schema === 'LegalEntity') return 'org';
    return 'other';
}

// Called once, after the stream ends, with how many data rows were seen vs.
// actually kept - lets a caller log an honest "kept N of M rows" line
// instead of silently truncating.
export type CapCallback = (rowsSeen: number, rowsKept: number) => void;

async function* parseCollection(
    url: string,
    list: ListName,
    maxRecords: number,
    onDone?: CapCallback,
): AsyncGenerator<NormalizedEntity> {
    const listVersion = new Date().toISOString();
    let header: Column[] | null = null;
    let emitted = 0;
    let rowsSeen = 0;

    for await (const line of iterateCsvLines(streamTextChunks(url))) {
        if (!header) {
            header = parseCsvLine(line) as Column[];
            continue;
        }
        rowsSeen++;
        if (emitted >= maxRecords) continue; // keep counting rowsSeen for an honest skipped total

        const fields = parseCsvLine(line);
        const row: Partial<Record<Column, string>> = {};
        header.forEach((col, i) => {
            row[col] = fields[i];
        });

        const name = row.name?.trim();
        if (!name) continue;

        let dob: string | undefined;
        let dobYear: number | undefined;
        if (row.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(row.birth_date)) dob = row.birth_date;
        else if (row.birth_date) {
            const yearMatch = /\b(1[89]\d{2}|20\d{2})\b/.exec(row.birth_date);
            if (yearMatch) dobYear = Number(yearMatch[1]);
        }

        emitted++;
        yield {
            entityId: `${list}-${row.id}`,
            name,
            aliases: splitMulti(row.aliases),
            type: mapEntityType(row.schema),
            dob,
            dobYear,
            countries: splitMulti(row.countries),
            nationalities: splitMulti(row.countries),
            identifiers: splitMulti(row.identifiers).map((id) => `id:${id}`),
            programs: splitMulti(row.sanctions).length > 0 ? splitMulti(row.sanctions) : splitMulti(row.program_ids),
            sourceList: list,
            sourceUrl: url,
            listVersion,
            linkedTo: [],
            digitalCurrencyAddresses: [],
            details: row.dataset,
        };
    }

    onDone?.(rowsSeen, Math.min(emitted, maxRecords));
}

export function fetchOpenSanctionsSanctions(onDone?: CapCallback): AsyncGenerator<NormalizedEntity> {
    return parseCollection(OPENSANCTIONS_SANCTIONS_URL, 'OpenSanctions Sanctions', OPENSANCTIONS_MAX_RECORDS, onDone);
}

export function fetchOpenSanctionsPeps(onDone?: CapCallback): AsyncGenerator<NormalizedEntity> {
    return parseCollection(OPENSANCTIONS_PEPS_URL, 'OpenSanctions PEP', OPENSANCTIONS_MAX_RECORDS, onDone);
}
