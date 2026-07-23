// Parser for the EU Consolidated Financial Sanctions List (European
// Commission Financial Sanctions Database), published as XML. Streams one
// <sanctionEntity> element at a time (see xmlChunks.ts) rather than parsing
// the whole ~25MB document into one DOM tree.

import { XMLParser } from 'fast-xml-parser';

import { streamTextChunks } from '../http.js';
import type { EntityType, NormalizedEntity } from '../types.js';
import { iterateXmlElements } from '../xmlChunks.js';

export const EU_LIST_URL =
    'https://webgate.ec.europa.eu/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw';

const MAX_DETAILS_LENGTH = 300;
const entryParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false });

function asArray<T>(value: T | T[] | undefined): T[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
}

function mapEntityType(code: string | undefined): EntityType {
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
interface EuIdentification {
    '@_number'?: string;
    '@_iddocTypeDescription'?: string;
    '@_diplomaticType'?: string;
}
interface EuBirthdate {
    '@_birthdate'?: string;
    '@_year'?: string;
}
interface EuSanctionEntity {
    '@_logicalId'?: string | number;
    remark?: string;
    subjectType?: { '@_code'?: string };
    regulation?: EuRegulation | EuRegulation[];
    nameAlias?: EuNameAlias | EuNameAlias[];
    citizenship?: EuCitizenship | EuCitizenship[];
    identification?: EuIdentification | EuIdentification[];
    birthdate?: EuBirthdate | EuBirthdate[];
}

function mapEntity(entity: EuSanctionEntity, sourceUrl: string, listVersion: string): NormalizedEntity {
    const names = asArray(entity.nameAlias)
        .map((alias) => alias['@_wholeName']?.trim())
        .filter((name): name is string => Boolean(name));
    const strongNames = asArray(entity.nameAlias).filter((alias) => alias['@_strong'] === 'true');
    const primaryName = (strongNames[0] ?? asArray(entity.nameAlias)[0])?.['@_wholeName']?.trim() || 'Unknown';
    const aliases = [...new Set(names)].filter((name) => name !== primaryName);

    const programmes = [
        ...new Set(asArray(entity.regulation).map((reg) => reg['@_programme']).filter((p): p is string => Boolean(p))),
    ];
    const countries = [
        ...new Set(
            asArray(entity.citizenship)
                .map((c) => c['@_countryDescription'])
                .filter((c): c is string => Boolean(c)),
        ),
    ];

    const identifiers = asArray(entity.identification)
        .filter((id) => id['@_number'])
        .map((id) => {
            const kind = (id['@_iddocTypeDescription'] ?? 'id').trim().toLowerCase().replace(/\s+/g, '-');
            return `${kind}:${id['@_number']!.trim()}`;
        });

    let dob: string | undefined;
    let dobYear: number | undefined;
    const birthdateEntry = asArray(entity.birthdate)[0];
    if (birthdateEntry?.['@_birthdate']) {
        const raw = birthdateEntry['@_birthdate'];
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) dob = raw;
        const yearMatch = /\b(1[89]\d{2}|20\d{2})\b/.exec(raw);
        if (yearMatch) dobYear = Number(yearMatch[1]);
    } else if (birthdateEntry?.['@_year']) {
        dobYear = Number(birthdateEntry['@_year']) || undefined;
    }

    return {
        entityId: `EU Consolidated-${entity['@_logicalId']}`,
        name: primaryName,
        aliases,
        type: mapEntityType(entity.subjectType?.['@_code']),
        dob,
        dobYear,
        countries,
        nationalities: countries,
        identifiers,
        programs: programmes.length > 0 ? programmes : ['Unspecified'],
        sourceList: 'EU Consolidated',
        sourceUrl,
        listVersion,
        linkedTo: [],
        digitalCurrencyAddresses: [],
        details: entity.remark?.slice(0, MAX_DETAILS_LENGTH),
    };
}

export async function* fetchEuList(): AsyncGenerator<NormalizedEntity> {
    const listVersion = new Date().toISOString();
    for await (const rawEntity of iterateXmlElements(streamTextChunks(EU_LIST_URL), 'sanctionEntity')) {
        const parsed = entryParser.parse(rawEntity) as { sanctionEntity: EuSanctionEntity };
        yield mapEntity(parsed.sanctionEntity, EU_LIST_URL, listVersion);
    }
}
