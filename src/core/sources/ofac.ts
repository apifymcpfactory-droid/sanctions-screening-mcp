// Parser for the US Treasury OFAC Sanctions List Service exports. The SDN
// list and the Consolidated Non-SDN list are published on the same XML
// schema, so one parser covers both - only the source URL and list label
// differ. Streams one <sdnEntry> at a time (see xmlChunks.ts) rather than
// the whole ~25-30MB document at once - a full-document DOM parse of a file
// this size builds a JS object graph large enough to threaten a
// memory-constrained container on its own (this is the exact failure this
// tool OOM'd on previously).

import { XMLParser } from 'fast-xml-parser';

import { streamTextChunks } from '../http.js';
import type { EntityType, ListName, NormalizedEntity } from '../types.js';
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

function mapEntityType(sdnType: string | undefined): EntityType {
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
interface OfacId {
    idType?: string;
    idNumber?: string;
}
interface OfacDob {
    dateOfBirth?: string;
}
interface OfacEntry {
    uid: number | string;
    firstName?: string;
    lastName?: string;
    title?: string;
    remarks?: string;
    sdnType?: string;
    programList?: { program?: string | string[] };
    akaList?: { aka?: OfacAka | OfacAka[] };
    addressList?: { address?: OfacAddress | OfacAddress[] };
    idList?: { id?: OfacId | OfacId[] };
    dateOfBirthList?: { dateOfBirthItem?: OfacDob | OfacDob[] };
    nationalityList?: { nationality?: { country?: string } | Array<{ country?: string }> };
}

const fullName = (entry: { firstName?: string; lastName?: string }): string =>
    [entry.firstName, entry.lastName]
        .map((part) => part?.trim())
        .filter((part): part is string => Boolean(part))
        .join(' ');

// OFAC's free-text remarks conventionally flag 50%-rule ownership with a
// "(Linked To: ENTITY NAME)" annotation - this is the one place in the raw
// XML that signal is directly available.
const LINKED_TO_RE = /linked to:\s*([^;)]+)/gi;
function extractLinkedTo(text: string | undefined): string[] {
    if (!text) return [];
    const found: string[] = [];
    for (const match of text.matchAll(LINKED_TO_RE)) {
        const name = match[1]?.trim();
        if (name) found.push(name);
    }
    return [...new Set(found)];
}

// "Digital Currency Address - XBT" / "- ETH" / "- XMR" etc.
const DIGITAL_CURRENCY_RE = /^Digital Currency Address\s*-\s*(.+)$/i;
const CURRENCY_CODE_ALIASES: Record<string, string> = { XBT: 'BTC' };

function mapEntry(entry: OfacEntry, list: ListName, sourceUrl: string, listVersion: string): NormalizedEntity {
    const primaryName = fullName(entry) || 'Unknown';
    const aliases = asArray(entry.akaList?.aka)
        .map(fullName)
        .filter((name) => name.length > 0 && name !== primaryName);
    const programs = asArray(entry.programList?.program).filter((p): p is string => Boolean(p));
    const countries = asArray(entry.addressList?.address)
        .map((address) => address.country)
        .filter((country): country is string => Boolean(country));
    const nationalities = asArray(entry.nationalityList?.nationality)
        .map((n) => n.country)
        .filter((c): c is string => Boolean(c));

    const identifiers: string[] = [];
    const digitalCurrencyAddresses: string[] = [];
    for (const id of asArray(entry.idList?.id)) {
        if (!id.idNumber) continue;
        const currencyMatch = id.idType ? DIGITAL_CURRENCY_RE.exec(id.idType) : null;
        if (currencyMatch) {
            const code = currencyMatch[1].trim().toUpperCase();
            digitalCurrencyAddresses.push(`${CURRENCY_CODE_ALIASES[code] ?? code}:${id.idNumber.trim()}`);
        } else {
            const kind = (id.idType ?? 'id').trim().toLowerCase().replace(/\s+/g, '-');
            identifiers.push(`${kind}:${id.idNumber.trim()}`);
        }
    }

    let dobYear: number | undefined;
    let dob: string | undefined;
    const dobRaw = asArray(entry.dateOfBirthList?.dateOfBirthItem)[0]?.dateOfBirth;
    if (dobRaw) {
        const yearMatch = /\b(1[89]\d{2}|20\d{2})\b/.exec(dobRaw);
        if (yearMatch) dobYear = Number(yearMatch[1]);
        const fullDateMatch = /^(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/i.exec(
            dobRaw.trim(),
        );
        if (fullDateMatch) {
            const parsed = new Date(`${fullDateMatch[1]} ${fullDateMatch[2]} ${fullDateMatch[3]} UTC`);
            if (!Number.isNaN(parsed.getTime())) dob = parsed.toISOString().slice(0, 10);
        }
    }

    const remarkText = [entry.title, entry.remarks].filter(Boolean).join(' ');

    return {
        entityId: `${list}-${entry.uid}`,
        name: primaryName,
        aliases,
        type: mapEntityType(entry.sdnType),
        dob,
        dobYear,
        countries: [...new Set(countries)],
        nationalities: [...new Set(nationalities)],
        identifiers,
        programs: programs.length > 0 ? programs : ['Unspecified'],
        sourceList: list,
        sourceUrl,
        listVersion,
        linkedTo: extractLinkedTo(remarkText),
        digitalCurrencyAddresses,
        details: remarkText.slice(0, MAX_DETAILS_LENGTH) || undefined,
    };
}

async function* parseOfacStream(
    chunks: AsyncGenerator<string>,
    list: ListName,
    sourceUrl: string,
): AsyncGenerator<NormalizedEntity> {
    const listVersion = new Date().toISOString();
    for await (const rawEntry of iterateXmlElements(chunks, 'sdnEntry')) {
        const parsed = entryParser.parse(rawEntry) as { sdnEntry: OfacEntry };
        yield mapEntry(parsed.sdnEntry, list, sourceUrl, listVersion);
    }
}

export function fetchOfacSdn(): AsyncGenerator<NormalizedEntity> {
    return parseOfacStream(streamTextChunks(OFAC_SDN_URL), 'OFAC SDN', OFAC_SDN_URL);
}

export function fetchOfacConsolidated(): AsyncGenerator<NormalizedEntity> {
    return parseOfacStream(streamTextChunks(OFAC_CONSOLIDATED_URL), 'OFAC Consolidated', OFAC_CONSOLIDATED_URL);
}
