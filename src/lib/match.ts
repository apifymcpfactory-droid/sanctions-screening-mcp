// Deterministic fuzzy name matching. Uses Monge-Elkan token alignment (each
// token in one name matched to its best Jaro-Winkler counterpart in the
// other, averaged both directions) rather than a plain whole-string
// comparison - a naive whole-string Jaro-Winkler lets two otherwise unrelated
// multi-word names score deceptively high just from sharing one common word
// (e.g. "Acme Test Company" vs "Metil Steel Company"), which is unacceptable
// false-positive risk for a screening tool. No LLM, no external API - same
// inputs always produce the same score.

import { significantTokens } from './normalize.js';

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

// Compares two raw names and returns an integer 0-100 similarity score,
// insensitive to word order (token alignment, not string order).
export function scoreNames(a: string, b: string): number {
    const aTokens = significantTokens(a);
    const bTokens = significantTokens(b);
    if (aTokens.length === 0 || bTokens.length === 0) return 0;
    const similarity = (mongeElkan(aTokens, bTokens) + mongeElkan(bTokens, aTokens)) / 2;
    return Math.round(similarity * 100);
}
