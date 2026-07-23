// Diffs a prior screening run's results against a fresh re-screen (against
// newly-fetched lists) and returns only what changed - a monitor run against
// a stable subject list should be cheap to read even when the subject count
// is large.

import type { MonitorChange, MonitorResult, ScreeningSummaryRecord } from './types.js';

const SCORE_CHANGE_THRESHOLD = 10;

function listVersionsOf(record: ScreeningSummaryRecord): string {
    return record.matches
        .flatMap((m) => m.sources.map((s) => `${s.list}:${s.listVersion}`))
        .sort()
        .join('|');
}

export function diffScreeningRuns(previous: ScreeningSummaryRecord[], current: ScreeningSummaryRecord[]): MonitorResult {
    const previousBySubject = new Map(previous.map((r) => [r.subject, r]));
    const changes: MonitorChange[] = [];
    let unchangedCount = 0;

    for (const record of current) {
        const prior = previousBySubject.get(record.subject);

        if (record.matchCount > 0 && (!prior || prior.matchCount === 0)) {
            changes.push({
                subject: record.subject,
                changeType: 'new-hit',
                detail: prior
                    ? `Was clear; now ${record.matchCount} match(es), verdict ${record.verdict}.`
                    : `New subject; ${record.matchCount} match(es), verdict ${record.verdict}.`,
                current: record,
                previous: prior,
            });
            continue;
        }

        if (!prior) {
            // A brand-new subject with no matches - nothing to report.
            unchangedCount++;
            continue;
        }

        if (prior.matchCount > 0 && record.matchCount === 0) {
            changes.push({
                subject: record.subject,
                changeType: 'newly-cleared',
                detail: `Previously ${prior.matchCount} match(es) (${prior.verdict}); now clear.`,
                current: record,
                previous: prior,
            });
            continue;
        }

        if (record.matchCount > 0 && listVersionsOf(prior) !== listVersionsOf(record)) {
            changes.push({
                subject: record.subject,
                changeType: 'list-version-changed',
                detail: 'Matched list(s) refreshed since the prior run; verdict and match count unchanged.',
                current: record,
                previous: prior,
            });
            continue;
        }

        if (Math.abs(prior.highestConfidence - record.highestConfidence) >= SCORE_CHANGE_THRESHOLD) {
            changes.push({
                subject: record.subject,
                changeType: 'score-changed',
                detail: `Highest confidence moved from ${prior.highestConfidence} to ${record.highestConfidence}.`,
                current: record,
                previous: prior,
            });
            continue;
        }

        unchangedCount++;
    }

    return {
        mode: 'monitor',
        changedCount: changes.length,
        unchangedCount,
        changes,
        checkedAt: new Date().toISOString(),
    };
}
