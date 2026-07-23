// Orchestrates one subject's screening: crypto-address short-circuit, name
// matching (via a cheap token-prefix blocking index so this stays usable
// against a pool that includes OpenSanctions' 100k+ records), cross-list
// consolidation, whitelist suppression, and verdict/narrative generation.

import { detectCryptoAddress } from './crypto.js';
import { buildConsolidatedMatches, type Candidate } from './merge.js';
import { matchAgainstName } from './match.js';
import { significantTokens } from './normalize.js';
import { filterWhitelisted } from './whitelist.js';
import { buildScreeningSummary } from './verdict.js';
import type { ConsolidatedMatch, EntityTypeFilter, ListName, NormalizedEntity, ScreenOptions, ScreeningSummaryRecord, Subject } from './types.js';

const BLOCK_PREFIX_LENGTH = 3;

export interface EntityPool {
    entities: NormalizedEntity[];
    blockIndex: Map<string, NormalizedEntity[]>;
    cryptoIndex: Map<string, NormalizedEntity>;
}

function blockKeysFor(name: string): string[] {
    return significantTokens(name).map((token) => token.slice(0, BLOCK_PREFIX_LENGTH));
}

// Built once per run (not per subject) from the full merged list pool.
export function buildEntityPool(entities: NormalizedEntity[]): EntityPool {
    const blockIndex = new Map<string, NormalizedEntity[]>();
    const cryptoIndex = new Map<string, NormalizedEntity>();

    for (const entity of entities) {
        const names = [entity.name, ...entity.aliases];
        const keys = new Set(names.flatMap(blockKeysFor));
        for (const key of keys) {
            const bucket = blockIndex.get(key) ?? [];
            bucket.push(entity);
            blockIndex.set(key, bucket);
        }
        for (const addr of entity.digitalCurrencyAddresses) {
            cryptoIndex.set(addr, entity);
        }
    }

    return { entities, blockIndex, cryptoIndex };
}

function candidateEntitiesFor(query: string, pool: EntityPool, lists?: ListName[]): NormalizedEntity[] {
    const keys = new Set(blockKeysFor(query));
    const seen = new Set<string>();
    const candidates: NormalizedEntity[] = [];
    for (const key of keys) {
        for (const entity of pool.blockIndex.get(key) ?? []) {
            if (seen.has(entity.entityId)) continue;
            if (lists && !lists.includes(entity.sourceList)) continue;
            seen.add(entity.entityId);
            candidates.push(entity);
        }
    }
    return candidates;
}

function bestNameMatch(query: string, entity: NormalizedEntity, fuzzy: boolean): { score: number; matchedName: string; matchType: Candidate['matchType'] } {
    let best = { score: 0, matchedName: entity.name, matchType: 'fuzzy' as Candidate['matchType'] };
    for (const candidateName of [entity.name, ...entity.aliases]) {
        const outcome = matchAgainstName(query, candidateName, fuzzy);
        if (outcome.score > best.score) best = { score: outcome.score, matchedName: candidateName, matchType: outcome.matchType };
    }
    return best;
}

function entityTypeMatches(entity: NormalizedEntity, filter: EntityTypeFilter | undefined): boolean {
    return !filter || filter === 'any' || entity.type === filter;
}

export function screenSubject(subject: Subject, pool: EntityPool, options: ScreenOptions): ScreeningSummaryRecord {
    const query = subject.name.trim();
    const entityTypeFilter = subject.entityType ?? options.entityType;
    const listCount = options.lists?.length ?? new Set(pool.entities.map((e) => e.sourceList)).size;

    if (!query) {
        return buildScreeningSummary(subject, [], 0, listCount, options.threshold);
    }

    const cryptoCurrency = detectCryptoAddress(query);
    let matches: ConsolidatedMatch[];

    if (cryptoCurrency) {
        const owner = pool.cryptoIndex.get(`${cryptoCurrency}:${query}`);
        matches = owner
            ? buildConsolidatedMatches(subject, [{ entity: owner, score: 100, matchedName: query, matchType: 'crypto-address' }])
            : [];
    } else {
        const candidates: Candidate[] = candidateEntitiesFor(query, pool, options.lists)
            .filter((entity) => entityTypeMatches(entity, entityTypeFilter))
            .filter((entity) => !subject.program || entity.programs.some((p) => p.toLowerCase().includes(subject.program!.toLowerCase())))
            .map((entity) => {
                const { score, matchedName, matchType } = bestNameMatch(query, entity, options.fuzzy);
                return { entity, score, matchedName, matchType };
            })
            .filter((c) => c.score >= options.threshold);

        matches = buildConsolidatedMatches(subject, candidates);
    }

    const { kept, whitelistedAny } = filterWhitelisted(matches, options.whitelist);
    const whitelistedCount = matches.length - kept.length;
    return buildScreeningSummary(subject, kept, whitelistedAny ? whitelistedCount : 0, listCount, options.threshold);
}

export function screenSubjects(subjects: Subject[], pool: EntityPool, options: ScreenOptions): ScreeningSummaryRecord[] {
    return subjects.map((subject) => screenSubject(subject, pool, options));
}
