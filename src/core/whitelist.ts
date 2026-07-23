// Suppresses matches the caller has already reviewed and cleared. Entries
// can be a list entityId (e.g. "OFAC SDN-36") or a name (case-insensitive,
// same normalisation as matching) - whichever the caller has on hand from a
// prior decision.

import { normalizeName } from './normalize.js';
import type { ConsolidatedMatch } from './types.js';

export function isWhitelisted(match: ConsolidatedMatch, whitelist: string[]): boolean {
    if (whitelist.length === 0) return false;
    const whitelistIds = new Set(whitelist.map((w) => w.trim()));
    const whitelistNames = new Set(whitelist.map((w) => normalizeName(w)));

    if (whitelistNames.has(normalizeName(match.matchedName))) return true;
    if (match.aliasHit && whitelistNames.has(normalizeName(match.aliasHit))) return true;
    return match.sources.some((source) => whitelistIds.has(source.entityId));
}

export function filterWhitelisted(
    matches: ConsolidatedMatch[],
    whitelist: string[],
): { kept: ConsolidatedMatch[]; whitelistedAny: boolean } {
    const kept = matches.filter((match) => !isWhitelisted(match, whitelist));
    return { kept, whitelistedAny: kept.length !== matches.length };
}
