// Turns a subject's consolidated matches into the plain-English decision a
// compliance analyst actually needs: a verdict, a next step, and a
// rationale - written for CLEAR results too, so a negative screening result
// is documented evidence rather than a silent absence of output.

import type { ConsolidatedMatch, ScreeningSummaryRecord, Subject, Verdict } from './types.js';

const ESCALATE_CONFIDENCE = 95;
const HIGH_RISK_CODES = new Set(['TERRORISM', 'DPRK', 'PROLIFERATION', 'GLOBAL-MAGNITSKY']);

function isEscalationWorthy(match: ConsolidatedMatch): boolean {
    if (match.autoCleared) return false;
    if (match.confidence >= ESCALATE_CONFIDENCE) return true;
    if (match.ownershipRisk.flagged && match.confidence >= 85) return true;
    if (match.riskIndicators.some((r) => HIGH_RISK_CODES.has(r.code)) && match.confidence >= 85) return true;
    return false;
}

function recommendedActionFor(verdict: Verdict): string {
    if (verdict === 'CLEAR') return 'No action required. Proceed - keep this result as your screening evidence.';
    if (verdict === 'REVIEW') {
        return 'Route to a compliance analyst for manual review before proceeding. Do not treat this as a confirmed hit or a clearance on its own.';
    }
    return 'Do not proceed. Escalate immediately to your compliance officer / MLRO for a full manual determination before any onboarding, payment or transaction.';
}

function priorityScoreFor(matches: ConsolidatedMatch[]): number {
    if (matches.length === 0) return 0;
    const highestConfidence = Math.max(...matches.map((m) => m.confidence));
    const ownershipBoost = matches.some((m) => m.ownershipRisk.flagged) ? 10 : 0;
    const riskBoost = matches.some((m) => m.riskIndicators.some((r) => HIGH_RISK_CODES.has(r.code))) ? 10 : 0;
    const allAutoCleared = matches.every((m) => m.autoCleared);
    if (allAutoCleared) return Math.round(highestConfidence * 0.2);
    return Math.min(100, Math.round(highestConfidence + ownershipBoost + riskBoost));
}

function narrativeFor(
    subject: Subject,
    verdict: Verdict,
    matches: ConsolidatedMatch[],
    autoClearedCount: number,
    whitelistedCount: number,
    listCount: number,
    threshold: number,
): string {
    const asOf = new Date().toISOString().slice(0, 10);

    if (whitelistedCount > 0 && matches.length === 0) {
        return `"${subject.name}" matched ${whitelistedCount} previously-cleared whitelist entr${whitelistedCount === 1 ? 'y' : 'ies'}; suppressed per prior decision. No other match above ${threshold} across ${listCount} lists as of ${asOf}.`;
    }

    if (matches.length === 0 && autoClearedCount === 0) {
        return `No match above ${threshold} across ${listCount} lists as of ${asOf}.`;
    }

    if (matches.length === 0 && autoClearedCount > 0) {
        return `${autoClearedCount} potential name match(es) found but auto-cleared: name similarity was below strong-match confidence and subject-provided attributes (date of birth, country, or identifier) contradicted the list entry. No confirmed match above ${threshold} across ${listCount} lists as of ${asOf}.`;
    }

    const top = matches[0];
    const listNames = [...new Set(top.sources.map((s) => s.list))].join(', ');
    const riskText = top.riskIndicators.length > 0 ? ` Flagged programme(s): ${top.riskIndicators.map((r) => r.label).join('; ')}.` : '';
    const ownershipText = top.ownershipRisk.flagged
        ? ` Source data also names a linkage to: ${top.ownershipRisk.linkedEntities.join(', ')} (ownership signal only, not a computed 50%-rule determination).`
        : '';
    const verdictText =
        verdict === 'ESCALATE'
            ? 'This is a high-confidence match requiring immediate escalation.'
            : 'This match requires analyst review before any decision is made.';

    return `"${subject.name}" matched "${top.matchedName}" (${top.confidence}/100, ${top.matchType}) on ${listNames}.${riskText}${ownershipText} ${verdictText}`;
}

export function buildScreeningSummary(
    subject: Subject,
    allMatches: ConsolidatedMatch[],
    whitelistedCount: number,
    listCount: number,
    threshold: number,
): ScreeningSummaryRecord {
    const activeMatches = allMatches.filter((m) => !m.autoCleared);
    const autoClearedCount = allMatches.length - activeMatches.length;

    let verdict: Verdict = 'CLEAR';
    if (activeMatches.some(isEscalationWorthy)) verdict = 'ESCALATE';
    else if (activeMatches.length > 0) verdict = 'REVIEW';

    const highestConfidence = allMatches.length > 0 ? Math.max(...allMatches.map((m) => m.confidence)) : 0;

    return {
        subject: subject.name,
        verdict,
        recommendedAction: recommendedActionFor(verdict),
        priorityScore: priorityScoreFor(activeMatches.length > 0 ? activeMatches : allMatches),
        matchCount: activeMatches.length,
        highestConfidence,
        narrative: narrativeFor(subject, verdict, activeMatches, autoClearedCount, whitelistedCount, listCount, threshold),
        matches: allMatches,
        whitelisted: whitelistedCount > 0,
    };
}
