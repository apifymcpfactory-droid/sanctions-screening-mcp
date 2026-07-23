// Deterministic fuzzy name matching. Uses Monge-Elkan token alignment (each
// token in one name matched to its best Jaro-Winkler counterpart in the
// other, averaged both directions) rather than a plain whole-string
// comparison - a naive whole-string Jaro-Winkler lets two otherwise unrelated
// multi-word names score deceptively high just from sharing one common word
// (e.g. "Acme Test Company" vs "Metil Steel Company"), which is unacceptable
// false-positive risk for a screening tool. No LLM, no external API - same
// inputs always produce the same score.

import { significantTokens, significantTokensTransliterated } from './normalize.js';
import type { MatchType } from './types.js';

// Standard Jaro similarity (0-1): matches are characters within a sliding
// window of each other; transpositions are matched-but-out-of-order pairs.
function jaroSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matchDistance = Math.max(Math.floor(Math.max(a.length, b.length) / 2) - 1, 0);
    const aMatched = new Array<boolean>(a.length).fill(false);
    const bMatched = new Array<boolean>(b.length).fill(false);

    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        const start = Math.max(0, i - matchDistance);
        const end = Math.min(i + matchDistance + 1, b.length);
        for (let j = start; j < end; j++) {
            if (bMatched[j] || a[i] !== b[j]) continue;
            aMatched[i] = true;
            bMatched[j] = true;
            matches++;
            break;
        }
    }
    if (matches === 0) return 0;

    let transpositions = 0;
    let bIndex = 0;
    for (let i = 0; i < a.length; i++) {
        if (!aMatched[i]) continue;
        while (!bMatched[bIndex]) bIndex++;
        if (a[i] !== b[bIndex]) transpositions++;
        bIndex++;
    }
    transpositions = Math.floor(transpositions / 2);

    return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

const WINKLER_PREFIX_LENGTH = 4;
const WINKLER_SCALING_FACTOR = 0.1;

// Jaro-Winkler (0-1): boosts the Jaro score for strings that share a common
// leading prefix, which rewards names that differ only in a later token.
function jaroWinkler(a: string, b: string): number {
    const jaro = jaroSimilarity(a, b);
    let prefixLength = 0;
    const maxPrefix = Math.min(WINKLER_PREFIX_LENGTH, a.length, b.length);
    while (prefixLength < maxPrefix && a[prefixLength] === b[prefixLength]) prefixLength++;
    return jaro + prefixLength * WINKLER_SCALING_FACTOR * (1 - jaro);
}

function bestTokenSimilarity(token: string, tokens: string[]): number {
    let best = 0;
    for (const candidate of tokens) {
        const sim = jaroWinkler(token, candidate);
        if (sim > best) best = sim;
    }
    return best;
}

// Monge-Elkan similarity: for each token in `from`, take its best match in
// `to`, then average. Asymmetric on its own (favors whichever name is
// shorter), so scoreNames averages both directions.
function mongeElkan(from: string[], to: string[]): number {
    if (from.length === 0 || to.length === 0) return 0;
    const total = from.reduce((sum, token) => sum + bestTokenSimilarity(token, to), 0);
    return total / from.length;
}

function scoreTokens(aTokens: string[], bTokens: string[]): number {
    if (aTokens.length === 0 || bTokens.length === 0) return 0;
    const similarity = (mongeElkan(aTokens, bTokens) + mongeElkan(bTokens, aTokens)) / 2;
    return Math.round(similarity * 100);
}

// Compares two raw names and returns an integer 0-100 similarity score,
// insensitive to word order (token alignment, not string order).
export function scoreNames(a: string, b: string): number {
    return scoreTokens(significantTokens(a), significantTokens(b));
}

export interface NameMatchOutcome {
    score: number;
    matchType: MatchType;
}

// Scores a query against one candidate name, trying an exact normalised
// match first, then direct fuzzy, then a transliterated pass (Cyrillic/Greek
// -> Latin on both sides) so a romanised query can still hit a
// native-script list entry. When `fuzzy` is false, only the exact and
// transliteration-exact checks run - useful for a strict "no fuzz" mode.
export function matchAgainstName(query: string, candidate: string, fuzzy: boolean): NameMatchOutcome {
    const queryTokens = significantTokens(query);
    const candidateTokens = significantTokens(candidate);
    const exactScore = scoreTokens(queryTokens, candidateTokens);
    if (exactScore === 100) return { score: 100, matchType: 'exact' };

    const translitQueryTokens = significantTokensTransliterated(query);
    const translitCandidateTokens = significantTokensTransliterated(candidate);
    const translitScore = scoreTokens(translitQueryTokens, translitCandidateTokens);
    if (translitScore === 100) return { score: 100, matchType: 'transliteration' };

    if (!fuzzy) {
        // Non-fuzzy mode still allows a near-exact (>=98) hit through, since
        // that band is almost always a punctuation/whitespace difference
        // rather than a genuinely distinct name.
        const best = Math.max(exactScore, translitScore);
        return best >= 98 ? { score: best, matchType: best === exactScore ? 'exact' : 'transliteration' } : { score: 0, matchType: 'fuzzy' };
    }

    if (translitScore > exactScore) {
        return { score: translitScore, matchType: translitScore >= 92 ? 'strong-fuzzy' : 'transliteration' };
    }
    return { score: exactScore, matchType: exactScore >= 92 ? 'strong-fuzzy' : 'fuzzy' };
}
