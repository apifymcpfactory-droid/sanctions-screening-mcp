// Deterministic name normalisation shared by every list parser and the
// matcher. No LLM, no external service - same input always produces the
// same output.

// Strips diacritics via Unicode decomposition (e.g. "e" -> "e", "n~" -> "n").
const COMBINING_MARKS_RE = /[̀-ͯ]/g;
const stripDiacritics = (value: string): string => value.normalize('NFKD').replace(COMBINING_MARKS_RE, '');

// Common Cyrillic -> Latin transliteration (ISO 9-ish, ASCII-friendly), and
// basic modern Greek -> Latin, covering the two non-Latin scripts most
// official lists (OFAC, EU, UN, OpenSanctions) actually romanise inline. Does
// not cover Arabic, Hebrew or CJK scripts - names in those scripts are
// matched only against whatever Latin rendering the source list provides,
// same as before this change.
const CYRILLIC_MAP: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'iu', я: 'ia',
    і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};
const GREEK_MAP: Record<string, string> = {
    α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l',
    μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f',
    χ: 'ch', ψ: 'ps', ω: 'o',
};
const TRANSLIT_MAP: Record<string, string> = { ...CYRILLIC_MAP, ...GREEK_MAP };

// Best-effort romanisation for the scripts in TRANSLIT_MAP; leaves any other
// character (Latin, digits, Arabic, CJK, punctuation) untouched. Diacritics
// are stripped first so accented Greek/Cyrillic vowels (e.g. Greek tonos
// "ώ" -> "ω") still hit the map instead of falling through unmapped.
export function transliterate(raw: string): string {
    let out = '';
    for (const ch of stripDiacritics(raw.toLowerCase())) {
        out += TRANSLIT_MAP[ch] ?? ch;
    }
    return out;
}

const PUNCTUATION_RE = /[.,'"`‘’“”\-_/\\()[\]{}&*:;!?]+/g;
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
    'company', 'co', 'corp', 'corporation', 'incorporated', 'inc', 'ltd', 'limited', 'llc', 'llp',
    'plc', 'gmbh', 'sa', 'srl', 'bv', 'nv', 'ag', 'group', 'holdings', 'holding', 'sac', 'spa',
    'kg', 'oy', 'ab', 'sl', 'pty', 'pte', 'the', 'and', 'of',
]);

// Tokens with generic filler words removed - falls back to every token if
// filtering would leave nothing (e.g. a name that is only "The Group Ltd").
export function significantTokens(raw: string): string[] {
    const tokens = normalizeName(raw).split(' ').filter(Boolean);
    const filtered = tokens.filter((token) => !GENERIC_WORDS.has(token));
    return filtered.length > 0 ? filtered : tokens;
}

// Same as significantTokens, but on the transliterated form - used as a
// second matching pass so a Cyrillic/Greek list entry can match a Latin
// query (or vice versa) without needing an exact script match.
export function significantTokensTransliterated(raw: string): string[] {
    return significantTokens(transliterate(raw));
}
