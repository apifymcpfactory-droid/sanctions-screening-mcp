// Consolidates raw per-entity hits into one match per real-world identity.
// The same person or company is very often listed independently by OFAC, the
// EU, the UK and the UN (and may also appear in OpenSanctions' aggregation of
// those same sources) - returning one row per list per person would make a
// four-list hit look like four separate people. Candidates surviving the
// name-match threshold are clustered by high name-similarity to each other
// (not to the query) so genuinely distinct people who both happen to match
// the query are kept separate.

import { scoreNames } from './match.js';
import { riskIndicatorsForPrograms, PEP_INDICATOR } from './riskIndicators.js';
import { analyzeFalsePositive, shouldAutoClear } from './falsePositive.js';
import { OWNERSHIP_NO_SIGNAL_NOTE, OWNERSHIP_SIGNAL_NOTE } from './ownershipRisk.js';
import type { ConsolidatedMatch, MatchSource, MatchType, NormalizedEntity, Subject } from './types.js';

const CLUSTER_MERGE_THRESHOLD = 90;

export interface Candidate {
    entity: NormalizedEntity;
    score: number;
    matchedName: string;
    matchType: MatchType;
}

// Union-find over candidate indices, merging any two whose entities' primary
// names score >= CLUSTER_MERGE_THRESHOLD against each other.
function clusterCandidates(candidates: Candidate[]): Candidate[][] {
    const parent = candidates.map((_, i) => i);
    function find(i: number): number {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i]];
            i = parent[i];
        }
        return i;
    }
    function union(a: number, b: number): void {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
            if (candidates[i].entity.sourceList === candidates[j].entity.sourceList) continue; // same list never needs merging with itself here
            if (scoreNames(candidates[i].entity.name, candidates[j].entity.name) >= CLUSTER_MERGE_THRESHOLD) {
                union(i, j);
            }
        }
    }

    const groups = new Map<number, Candidate[]>();
    candidates.forEach((c, i) => {
        const root = find(i);
        const group = groups.get(root) ?? [];
        group.push(c);
        groups.set(root, group);
    });
    return [...groups.values()];
}

function buildSources(cluster: Candidate[]): MatchSource[] {
    const byList = new Map<string, MatchSource>();
    for (const { entity } of cluster) {
        if (byList.has(entity.sourceList)) continue;
        byList.set(entity.sourceList, {
            list: entity.sourceList,
            entityId: entity.entityId,
            program: entity.programs.join(', '),
            listVersion: entity.listVersion,
            sourceUrl: entity.sourceUrl,
        });
    }
    return [...byList.values()];
}

export function buildConsolidatedMatches(subject: Subject, candidates: Candidate[]): ConsolidatedMatch[] {
    const clusters = clusterCandidates(candidates);

    return clusters
        .map((cluster): ConsolidatedMatch => {
            const top = cluster.reduce((best, c) => (c.score > best.score ? c : best), cluster[0]);
            const allPrograms = cluster.flatMap((c) => c.entity.programs);
            const riskIndicators = riskIndicatorsForPrograms(allPrograms);
            if (cluster.some((c) => c.entity.sourceList === 'OpenSanctions PEP')) {
                riskIndicators.push(PEP_INDICATOR);
            }

            const linkedEntities = [...new Set(cluster.flatMap((c) => c.entity.linkedTo))];
            const falsePositiveAnalysis = analyzeFalsePositive(subject, top.entity, top.score);

            return {
                matchedName: top.entity.name,
                aliasHit: top.matchedName !== top.entity.name ? top.matchedName : undefined,
                confidence: top.score,
                matchType: top.matchType,
                sources: buildSources(cluster),
                riskIndicators,
                falsePositiveAnalysis,
                autoCleared: shouldAutoClear(falsePositiveAnalysis),
                ownershipRisk: {
                    flagged: linkedEntities.length > 0,
                    linkedEntities,
                    note: linkedEntities.length > 0 ? OWNERSHIP_SIGNAL_NOTE : OWNERSHIP_NO_SIGNAL_NOTE,
                },
            };
        })
        .sort((a, b) => b.confidence - a.confidence);
}
