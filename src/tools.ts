/**
 * Pure tool functions — business logic only, no MCP dependency.
 * Each function is registered as an MCP tool in index.ts.
 *
 * This separation makes tools easy to unit test without MCP infrastructure.
 */

import { getAllRecords, getListStatus } from './lib/cache.js';
import { screenName } from './lib/screening.js';
import type { EntityTypeFilter, ListStatusEntry, MatchDetail } from './types.js';

const DEFAULT_THRESHOLD = 85;
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export interface ScreenEntityOptions {
    entityType?: EntityTypeFilter;
    country?: string;
    threshold?: number;
}

export interface ScreenNameResult {
    query: string;
    isMatch: boolean;
    topScore: number;
    matches: MatchDetail[];
}

export interface ScreenEntityResult {
    [key: string]: unknown;
    results: ScreenNameResult[];
}

// Screens every name in `names` against the in-memory OFAC/EU/UK/UN cache.
// Aliases are always included in matching (there's no toggle for it - turning
// it off only reduces screening quality, which is the wrong default for a
// compliance tool). Blank/whitespace-only names are returned with no lookup
// performed rather than silently dropped, so callers can see what was skipped.
export function screenEntity(names: string[], options: ScreenEntityOptions = {}): ScreenEntityResult {
    const entityType = options.entityType ?? 'any';
    const country = options.country?.trim() || undefined;
    const threshold = clamp(Math.trunc(options.threshold ?? DEFAULT_THRESHOLD), 0, 100);
    const records = getAllRecords();

    const results = names.map((rawName): ScreenNameResult => {
        const query = (rawName ?? '').trim();
        if (!query) {
            return { query: rawName ?? '', isMatch: false, topScore: 0, matches: [] };
        }
        const outcome = screenName(query, records, { entityType, country, threshold, includeAliases: true });
        return { query, isMatch: outcome.isMatch, topScore: outcome.topScore, matches: outcome.matches };
    });

    return { results };
}

export interface ListStatusResult {
    [key: string]: unknown;
    lists: ListStatusEntry[];
}

// Reports each official list's cached record count and last-refresh time, so
// callers can confirm data freshness before relying on a screening result.
export function listStatus(): ListStatusResult {
    return { lists: getListStatus() };
}
