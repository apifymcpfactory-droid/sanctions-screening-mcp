// Parser for the US Treasury OFAC Sanctions List Service exports. The SDN
// list and the Consolidated Non-SDN list are published on the same XML
// schema, so one parser covers both - only the source URL and list label differ.
//
// Parses one <sdnEntry> at a time (see xmlChunks.ts) rather than the whole
// ~28MB document at once - a full-document DOM parse of a file this size
// builds a JS object graph large enough to threaten a memory-constrained
// container on its own.

import { XMLParser } from 'fast-xml-parser';

import type { ListName, RecordEntityType, SanctionRecord } from '../../types.js';
import { fetchListFile } from '../http.js';
import { iterateXmlElements } from '../xmlChunks.js';

export const OFAC_SDN_URL = 'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/sdn.xml';
export const OFAC_CONSOLIDATED_URL =
    'https://sanctionslistservice.ofac.treas.gov/api/publicationpreview/exports/consolidated.xml';

const MAX_DETAILS_LENGTH = 300;
const entryParser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

function mapEntityType(sdnType: string | undefined): RecordEntityType {
    if (sdnType === 'Individual') return 'person';
    if (sdnType === 'Entity') return 'org';
    return 'other';
}

interface OfacAka {
    firstName?: string;
    lastName?: string;
}

interface OfacAddress {
    country?: string;
}

interface OfacEntry {
    uid: number | string;
    firstName?: string;
    lastName?: string;
    title?: string;
    sdnType?: string;
    programList?: { program?: string | string[] };
    akaList?: { aka?: OfacAka | OfacAka[] };
    addressList?: { address?: OfacAddress | OfacAddress[] };
}

const fullName = (entry: { firstName?: string; lastName?: string }): string =>
    [entry.firstName, entry.lastName]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(' ');

function mapEntry(entry: OfacEntry, list: ListName): SanctionRecord {
    const primaryName = fullName(entry) || 'Unknown';
    const aliases = asArray(entry.akaList?.aka)
        .map(fullName)
        .filter((name) => name.length > 0 && name !== primaryName);
    const programs = asArray(entry.programList?.program);
    const countries = asArray(entry.addressList?.address)
        .map((address) => address.country)
        .filter((country): country is string => Boolean(country));

    return {
        entityId: `${list}-${entry.uid}`,
        list,
        program: programs.join(', ') || 'Unspecified',
        entityType: mapEntityType(entry.sdnType),
        primaryName,
        aliases,
        country: countries[0],
        details: entry.title?.slice(0, MAX_DETAILS_LENGTH),
    };
}

export function parseOfacXml(xml: string, list: ListName): SanctionRecord[] {
    const records: SanctionRecord[] = [];
    for (const chunk of iterateXmlElements(xml, 'sdnEntry')) {
        const parsed = entryParser.parse(chunk) as { sdnEntry: OfacEntry };
        records.push(mapEntry(parsed.sdnEntry, list));
    }
    return records;
}

export async function fetchOfacSdn(): Promise<SanctionRecord[]> {
    const xml = await fetchListFile(OFAC_SDN_URL);
    return parseOfacXml(xml, 'OFAC SDN');
}

export async function fetchOfacConsolidated(): Promise<SanctionRecord[]> {
    const xml = await fetchListFile(OFAC_CONSOLIDATED_URL);
    return parseOfacXml(xml, 'OFAC Consolidated');
}
