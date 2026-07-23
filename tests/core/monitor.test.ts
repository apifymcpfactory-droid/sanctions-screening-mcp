import { describe, expect, it } from 'vitest';

import { diffScreeningRuns } from '../../src/core/monitor.js';
import type { ScreeningSummaryRecord } from '../../src/core/types.js';

function record(overrides: Partial<ScreeningSummaryRecord>): ScreeningSummaryRecord {
    return {
        subject: 'John Smith',
        verdict: 'CLEAR',
        recommendedAction: 'No action required.',
        priorityScore: 0,
        matchCount: 0,
        highestConfidence: 0,
        narrative: 'No match.',
        matches: [],
        whitelisted: false,
        ...overrides,
    };
}

describe('diffScreeningRuns', () => {
    it('flags a subject that went from clear to matched as a new hit', () => {
        const previous = [record({ subject: 'A', matchCount: 0 })];
        const current = [record({ subject: 'A', matchCount: 1, verdict: 'REVIEW', highestConfidence: 90 })];
        const result = diffScreeningRuns(previous, current);
        expect(result.changedCount).toBe(1);
        expect(result.changes[0].changeType).toBe('new-hit');
    });

    it('flags a subject that went from matched to clear as newly cleared', () => {
        const previous = [record({ subject: 'A', matchCount: 1, verdict: 'REVIEW' })];
        const current = [record({ subject: 'A', matchCount: 0 })];
        const result = diffScreeningRuns(previous, current);
        expect(result.changes[0].changeType).toBe('newly-cleared');
    });

    it('reports no changes for an identical rerun', () => {
        const previous = [record({ subject: 'A' })];
        const current = [record({ subject: 'A' })];
        const result = diffScreeningRuns(previous, current);
        expect(result.changedCount).toBe(0);
        expect(result.unchangedCount).toBe(1);
    });

    it('treats a brand-new subject as a new hit when it has matches', () => {
        const previous: ScreeningSummaryRecord[] = [];
        const current = [record({ subject: 'B', matchCount: 1, verdict: 'ESCALATE' })];
        const result = diffScreeningRuns(previous, current);
        expect(result.changes[0].changeType).toBe('new-hit');
    });
});
