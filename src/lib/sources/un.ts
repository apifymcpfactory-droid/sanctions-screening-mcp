// Parser for the UN Security Council Consolidated List, published as XML
// with separate INDIVIDUALS and ENTITIES sections under one root document.

import { XMLParser } from 'fast-xml-parser';

import type { SanctionRecord } from '../../types.js';
import { fetchListFile } from '../http.js';

export const UN_LIST_URL = 'https://scsanctions.un.org/resources/xml/en/consolidated.xml';

const MAX_DETAILS_LENGTH = 300;

function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

interface UnAlias {
    QUALITY?: string;
    ALIAS_NAME?: string;
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
}

interface UnEntity {
    DATAID: number | string;
    FIRST_NAME?: string;
    UN_LIST_TYPE?: string;
    COMMENTS1?: string;
    ENTITY_ALIAS?: UnAlias | UnAlias[];
}

interface UnDocument {
    CONSOLIDATED_LIST?: {
        INDIVIDUALS?: { INDIVIDUAL?: UnIndividual | UnIndividual[] };
        ENTITIES?: { ENTITY?: UnEntity | UnEntity[] };
    };
}

export function parseUnXml(xml: string): SanctionRecord[] {
    const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false });
    const doc = parser.parse(xml) as UnDocument;

    const individuals = asArray(doc.CONSOLIDATED_LIST?.INDIVIDUALS?.INDIVIDUAL).map((entry): SanctionRecord => {
        const primaryName =
            [entry.FIRST_NAME, entry.SECOND_NAME, entry.THIRD_NAME, entry.FOURTH_NAME]
                .map((part) => part?.trim())
                .filter((part): part is string => Boolean(part))
                .join(' ') || 'Unknown';
        const aliases = asArray(entry.INDIVIDUAL_ALIAS)
            .map((alias) => alias.ALIAS_NAME?.trim())
            .filter((name): name is string => Boolean(name) && name !== primaryName);
        const nationalities = asArray(entry.NATIONALITY?.VALUE);

        return {
            entityId: `UN Consolidated-${entry.DATAID}`,
            list: 'UN Consolidated',
            program: entry.UN_LIST_TYPE || 'Unspecified',
            entityType: 'person',
            primaryName,
            aliases,
            country: nationalities[0],
            details: entry.COMMENTS1?.slice(0, MAX_DETAILS_LENGTH),
        };
    });

    const entities = asArray(doc.CONSOLIDATED_LIST?.ENTITIES?.ENTITY).map((entry): SanctionRecord => {
        const primaryName = entry.FIRST_NAME?.trim() || 'Unknown';
        const aliases = asArray(entry.ENTITY_ALIAS)
            .map((alias) => alias.ALIAS_NAME?.trim())
            .filter((name): name is string => Boolean(name) && name !== primaryName);

        return {
            entityId: `UN Consolidated-${entry.DATAID}`,
            list: 'UN Consolidated',
            program: entry.UN_LIST_TYPE || 'Unspecified',
            entityType: 'org',
            primaryName,
            aliases,
            details: entry.COMMENTS1?.slice(0, MAX_DETAILS_LENGTH),
        };
    });

    return [...individuals, ...entities];
}

export async function fetchUnList(): Promise<SanctionRecord[]> {
    const xml = await fetchListFile(UN_LIST_URL);
    return parseUnXml(xml);
}
