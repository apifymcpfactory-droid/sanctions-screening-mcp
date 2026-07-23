// Parser for the UN Security Council Consolidated List, published as XML
// with separate INDIVIDUALS and ENTITIES sections under one root document.
// Streams each <INDIVIDUAL>/<ENTITY> element one at a time (see
// xmlChunks.ts). The file is fetched twice (once per section) rather than
// built as one multi-tag streaming pass - this list is only a few MB, so the
// extra request is a simpler and still memory-lean tradeoff.

import { XMLParser } from 'fast-xml-parser';

import { streamTextChunks } from '../http.js';
import type { NormalizedEntity } from '../types.js';
import { iterateXmlElements } from '../xmlChunks.js';

export const UN_LIST_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

const MAX_DETAILS_LENGTH = 300;
const entryParser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });

function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

interface UnAlias {
    QUALITY?: string;
    ALIAS_NAME?: string;
}
interface UnDob {
    YEAR?: string;
    DATE?: string;
}
interface UnDocument {
    TYPE_OF_DOCUMENT?: string;
    NUMBER?: string;
}
interface UnIndividual {
    DATAID: number | string;
    FIRST_NAME?: string;
    SECOND_NAME?: string;
    THIRD_NAME?: string;
    FOURTH_NAME?: string;
    UN_LIST_TYPE?: string;
    COMMENTS1?: string;
    NATIONALITY?: { VALUE?: string | string[] };
    INDIVIDUAL_ALIAS?: UnAlias | UnAlias[];
    INDIVIDUAL_DATE_OF_BIRTH?: UnDob | UnDob[];
    INDIVIDUAL_DOCUMENT?: UnDocument | UnDocument[];
}
interface UnEntity {
    DATAID: number | string;
    FIRST_NAME?: string;
    UN_LIST_TYPE?: string;
    COMMENTS1?: string;
    ENTITY_ALIAS?: UnAlias | UnAlias[];
}

function mapIndividual(entry: UnIndividual, sourceUrl: string, listVersion: string): NormalizedEntity {
    const primaryName =
        [entry.FIRST_NAME, entry.SECOND_NAME, entry.THIRD_NAME, entry.FOURTH_NAME]
            .map((part) => part?.trim())
            .filter((part): part is string => Boolean(part))
            .join(' ') || 'Unknown';
    const aliases = asArray(entry.INDIVIDUAL_ALIAS)
        .map((alias) => alias.ALIAS_NAME?.trim())
        .filter((name): name is string => Boolean(name) && name !== primaryName);
    const nationalities = asArray(entry.NATIONALITY?.VALUE);

    const dobEntry = asArray(entry.INDIVIDUAL_DATE_OF_BIRTH)[0];
    let dobYear: number | undefined;
    if (dobEntry?.YEAR) dobYear = Number(dobEntry.YEAR) || undefined;
    else if (dobEntry?.DATE) {
        const yearMatch = /\b(1[89]\d{2}|20\d{2})\b/.exec(dobEntry.DATE);
        if (yearMatch) dobYear = Number(yearMatch[1]);
    }

    const identifiers = asArray(entry.INDIVIDUAL_DOCUMENT)
        .filter((doc) => doc.NUMBER)
        .map((doc) => `${(doc.TYPE_OF_DOCUMENT ?? 'document').trim().toLowerCase().replace(/\s+/g, '-')}:${doc.NUMBER!.trim()}`);

    return {
        entityId: `UN Consolidated-${entry.DATAID}`,
        name: primaryName,
        aliases,
        type: 'person',
        dobYear,
        countries: [],
        nationalities,
        identifiers,
        programs: [entry.UN_LIST_TYPE || 'Unspecified'],
        sourceList: 'UN Consolidated',
        sourceUrl,
        listVersion,
        linkedTo: [],
        digitalCurrencyAddresses: [],
        details: entry.COMMENTS1?.slice(0, MAX_DETAILS_LENGTH),
    };
}

function mapEntity(entry: UnEntity, sourceUrl: string, listVersion: string): NormalizedEntity {
    const primaryName = entry.FIRST_NAME?.trim() || 'Unknown';
    const aliases = asArray(entry.ENTITY_ALIAS)
        .map((alias) => alias.ALIAS_NAME?.trim())
        .filter((name): name is string => Boolean(name) && name !== primaryName);

    return {
        entityId: `UN Consolidated-${entry.DATAID}`,
        name: primaryName,
        aliases,
        type: 'org',
        countries: [],
        nationalities: [],
        identifiers: [],
        programs: [entry.UN_LIST_TYPE || 'Unspecified'],
        sourceList: 'UN Consolidated',
        sourceUrl,
        listVersion,
        linkedTo: [],
        digitalCurrencyAddresses: [],
        details: entry.COMMENTS1?.slice(0, MAX_DETAILS_LENGTH),
    };
}

export async function* fetchUnList(): AsyncGenerator<NormalizedEntity> {
    const listVersion = new Date().toISOString();

    for await (const raw of iterateXmlElements(streamTextChunks(UN_LIST_URL), 'INDIVIDUAL')) {
        const parsed = entryParser.parse(raw) as { INDIVIDUAL: UnIndividual };
        yield mapIndividual(parsed.INDIVIDUAL, UN_LIST_URL, listVersion);
    }
    for await (const raw of iterateXmlElements(streamTextChunks(UN_LIST_URL), 'ENTITY')) {
        const parsed = entryParser.parse(raw) as { ENTITY: UnEntity };
        yield mapEntity(parsed.ENTITY, UN_LIST_URL, listVersion);
    }
}
