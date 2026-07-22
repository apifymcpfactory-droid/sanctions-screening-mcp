// Core screening logic: score one query name against the cached records from
// all 5 official lists and return every match at or above the threshold.

import type { EntityTypeFilter, MatchDetail, SanctionRecord } from '../types.js';
import { scoreNames } from './match.js';
import { normalizeCountry } from './normalize.js';

export interface ScreenOptions {
    entityType: EntityTypeFilter;
    country?: string;
    threshold: number;
    includeAliases: boolean;
}

export interface ScreenOutcome {
    isMatch: boolean;
    topScore: number;
    matches: MatchDetail[];
}

export function screenName(query: string, records: SanctionRecord[], options: ScreenOptions): ScreenOutcome {
    const { entityType, country, threshold, includeAliases } = options;
    const normalizedCountry = country ? normalizeCountry(country) : undefined;

    let topScore = 0;
    const matches: MatchDetail[] = [];

    for (const record of records) {
        if (entityType !== 'any' && record.entityType !== entityType) continue;
        if (normalizedCountry) {
            if (!record.country || normalizeCountry(record.country) !== normalizedCountry) continue;
        }

        const candidateNames = includeAliases ? [record.primaryName, ...record.aliases] : [record.primaryName];
        let bestNameForRecord = record.primaryName;
        let bestScoreForRecord = 0;
        for (const candidateName of candidateNames) {
            const score = scoreNames(query, candidateName);
            if (score > bestScoreForRecord) {
                bestScoreForRecord = score;
                bestNameForRecord = candidateName;
            }
        }

        if (bestScoreForRecord > topScore) topScore = bestScoreForRecord;
        if (bestScoreForRecord >= threshold) {
            matches.push({
                matchedName: bestNameForRecord,
                list: record.list,
                program: record.program,
                entityType: record.entityType,
                score: bestScoreForRecord,
                entityId: record.entityId,
                details: record.details,
            });
        }
    }

    matches.sort((a, b) => b.score - a.score);
    return { isMatch: matches.length > 0, topScore, matches };
}
