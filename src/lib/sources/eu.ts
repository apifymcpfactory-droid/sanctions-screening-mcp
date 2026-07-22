// Parser for the EU Consolidated Financial Sanctions List (European
// Commission Financial Sanctions Database), published as XML.
//
// Parses one <sanctionEntity> at a time (see xmlChunks.ts) rather than the
// whole ~24MB document at once - a full-document DOM parse of a file this
// size builds a JS object graph large enough to threaten a memory-constrained
// container on its own.

import { XMLParser } from 'fast-xml-parser';

import type { RecordEntityType, SanctionRecord } from '../../types.js';
import { fetchListFile } from '../http.js';
import { iterateXmlElements } from '../xmlChunks.js';

export const EU_LIST_URL =
    'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

const MAX_DETAILS_LENGTH = 300;
const entryParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });

function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

function mapEntityType(code: string | undefined): RecordEntityType {
    if (code === 'person') return 'person';
    if (code === 'enterprise') return 'org';
    return 'other';
}

interface EuNameAlias {
    '@_wholeName'?: string;
    '@_strong'?: string;
}

interface EuRegulation {
    '@_programme'?: string;
}

interface EuCitizenship {
    '@_countryDescription'?: string;
}

interface EuSanctionEntity {
    '@_logicalId'?: string | number;
    remark?: string;
    subjectType?: { '@_code'?: string };
    regulation?: EuRegulation | EuRegulation[];
    nameAlias?: EuNameAlias | EuNameAlias[];
    citizenship?: EuCitizenship | EuCitizenship[];
}

function mapEntity(entity: EuSanctionEntity): SanctionRecord {
    const names = asArray(entity.nameAlias)
        .map((alias) => alias['@_wholeName']?.trim())
        .filter((name): name is string => Boolean(name));
    // The first "strong" alias is the list's primary name; fall back to the first name of any kind.
    const strongNames = asArray(entity.nameAlias).filter((alias) => alias['@_strong'] === 'true');
    const primaryName = (strongNames[0] ?? asArray(entity.nameAlias)[0])?.['@_wholeName']?.trim() || 'Unknown';
    const aliases = [...new Set(names)].filter((name) => name !== primaryName);

    const programmes = [
        ...new Set(
            asArray(entity.regulation)
                .map((reg) => reg['@_programme'])
                .filter(Boolean),
        ),
    ];
    const countries = [
        ...new Set(
            asArray(entity.citizenship)
                .map((c) => c['@_countryDescription'])
                .filter((c): c is string => Boolean(c)),
        ),
    ];

    return {
        entityId: `EU Consolidated-${entity['@_logicalId']}`,
        list: 'EU Consolidated',
        program: programmes.join(', ') || 'Unspecified',
        entityType: mapEntityType(entity.subjectType?.['@_code']),
        primaryName,
        aliases,
        country: countries[0],
        details: entity.remark?.slice(0, MAX_DETAILS_LENGTH),
    };
}

export function parseEuXml(xml: string): SanctionRecord[] {
    const records: SanctionRecord[] = [];
    for (const chunk of iterateXmlElements(xml, 'sanctionEntity')) {
        const parsed = entryParser.parse(chunk) as { sanctionEntity: EuSanctionEntity };
        records.push(mapEntity(parsed.sanctionEntity));
    }
    return records;
}

export async function fetchEuList(): Promise<SanctionRecord[]> {
    const xml = await fetchListFile(EU_LIST_URL);
    return parseEuXml(xml);
}
