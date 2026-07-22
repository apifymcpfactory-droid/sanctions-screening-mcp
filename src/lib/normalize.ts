// Deterministic name normalisation shared by every list parser and the matcher.
// No LLM, no external service - same input always produces the same output.

// Strips diacritics via Unicode decomposition (e.g. "é" -> "e", "ñ" -> "n").
// Covers Latin-script transliteration; does not transliterate non-Latin scripts
// (Arabic, Cyrillic, CJK) - those are matched on whatever Latin rendering the
// source list already provides.
const COMBINING_MARKS_RE = /[̀-ͯ]/g;
const stripDiacritics = (value: string): string => value.normalize('NFKD').replace(COMBINING_MARKS_RE, '');

// Common punctuation found in official list entries (periods, commas, quotes,
// hyphens, ampersands) collapses to a single space so "O'Brien", "Al-Rahman"
// and "Smith, John" normalise the same way as their unpunctuated variants.
const PUNCTUATION_RE = /[.,'"`’‘“”\-_/\\()[\]{}&*:;!?]+/g;
const WHITESPACE_RE = /\s+/g;

export const normalizeName = (raw: string): string =>
    stripDiacritics(raw).toLowerCase().replace(PUNCTUATION_RE, ' ').replace(WHITESPACE_RE, ' ').trim();

export const normalizeCountry = (raw: string): string => stripDiacritics(raw).toLowerCase().trim();

// Generic legal-entity suffixes and filler words carry almost no discriminating
// power for entity matching, but a single exact hit on one of them (e.g. both
// names containing "company") can otherwise inflate a token-based similarity
// score between two genuinely unrelated organisations - especially against a
// short candidate name where that one word is a large share of its tokens.
const GENERIC_WORDS = new Set([
    'company',
    'co',
    'corp',
    'corporation',
    'incorporated',
    'inc',
    'ltd',
    'limited',
    'llc',
    'llp',
    'plc',
    'gmbh',
    'sa',
    'srl',
    'bv',
    'nv',
    'ag',
    'group',
    'holdings',
    'holding',
    'sac',
    'spa',
    'kg',
    'oy',
    'ab',
    'sl',
    'pty',
    'pte',
    'the',
    'and',
    'of',
]);

// Tokens with generic filler words removed - falls back to every token if
// filtering would leave nothing (e.g. a name that is only "The Group Ltd").
export function significantTokens(raw: string): string[] {
    const tokens = normalizeName(raw).split(' ').filter(Boolean);
    const filtered = tokens.filter((token) => !GENERIC_WORDS.has(token));
    return filtered.length > 0 ? filtered : tokens;
}
