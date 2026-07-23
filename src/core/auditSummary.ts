// Builds the reproducible-evidence run summary: which list versions were
// used, the matching method/threshold, and a per-subject verdict tally.
// Persisting this (to a KV store, dataset, etc.) is the platform surface's
// job - this module only shapes the data.

import type { AuditListEntry, AuditSummary, ScreeningSummaryRecord, Verdict } from './types.js';

export const MATCH_METHOD_DESCRIPTION =
    'Monge-Elkan token-aligned Jaro-Winkler fuzzy name matching with Cyrillic/Greek transliteration, deterministic (no LLM).';

export function buildAuditSummary(
    runId: string,
    mode: 'screen' | 'monitor' | 'export',
    lists: AuditListEntry[],
    threshold: number,
    fuzzy: boolean,
    records: ScreeningSummaryRecord[],
): AuditSummary {
    const verdictCounts: Record<Verdict, number> = { CLEAR: 0, REVIEW: 0, ESCALATE: 0 };
    for (const record of records) verdictCounts[record.verdict]++;

    return {
        runId,
        generatedAt: new Date().toISOString(),
        mode,
        lists,
        matchMethod: MATCH_METHOD_DESCRIPTION,
        threshold,
        fuzzy,
        subjectCount: records.length,
        verdictCounts,
        subjects: records.map((r) => ({
            subject: r.subject,
            verdict: r.verdict,
            matchCount: r.matchCount,
            highestConfidence: r.highestConfidence,
        })),
    };
}
