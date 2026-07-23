// Regression test for run Gn7iKnDIQXYZ0jCqA: certificate generation crashed
// the whole Actor run with `WinAnsi cannot encode "Т" (0x0422)` the moment a
// matched name contained a Cyrillic character - StandardFonts.Helvetica can
// only encode WinAnsi (Latin-1). certificate.ts now embeds a bundled Noto
// Sans TTF via @pdf-lib/fontkit instead, which covers Cyrillic and Greek.

import { describe, expect, it } from 'vitest';

import { buildCertificatePdf } from '../../src/core/certificate.js';
import type { AuditListEntry, ScreeningSummaryRecord } from '../../src/core/types.js';

const ctx = {
    lists: [
        { list: 'OFAC SDN', listVersion: '2026-01-01T00:00:00.000Z', fetchedAt: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://example.com', recordCount: 19241 },
    ] as AuditListEntry[],
    threshold: 85,
    fuzzy: true,
    matchMethod: 'test method',
};

function cyrillicMatchRecord(): ScreeningSummaryRecord {
    return {
        subject: 'Транснефть',
        verdict: 'ESCALATE',
        recommendedAction: 'Escalate immediately.',
        priorityScore: 95,
        matchCount: 1,
        highestConfidence: 100,
        narrative: '"Транснефть" matched "Транснефть" (100/100, exact) on OFAC SDN.',
        matches: [
            {
                matchedName: 'Транснефть',
                confidence: 100,
                matchType: 'exact',
                sources: [{ list: 'OFAC SDN', entityId: 'OFAC SDN-1', program: 'RUSSIA-EO14024', listVersion: '2026-01-01T00:00:00.000Z', sourceUrl: 'https://example.com' }],
                riskIndicators: [{ code: 'RUSSIA-EO14024', label: 'Russia-related sanctions (incl. EO 14024)' }],
                falsePositiveAnalysis: { mismatchSignals: [], likelyFalsePositive: false, reason: 'No contradicting attributes found.' },
                autoCleared: false,
                ownershipRisk: { flagged: false, linkedEntities: [], note: 'No ownership/linkage signal found.' },
            },
        ],
        whitelisted: false,
    };
}

describe('buildCertificatePdf with non-Latin-1 names', () => {
    it('renders a Cyrillic subject and matched name without throwing', async () => {
        const pdfBytes = await buildCertificatePdf([cyrillicMatchRecord()], ctx);
        expect(pdfBytes.length).toBeGreaterThan(0);
        // A real PDF file starts with the "%PDF-" magic bytes.
        const header = Buffer.from(pdfBytes.slice(0, 5)).toString('ascii');
        expect(header).toBe('%PDF-');
    });

    it('renders a Greek name without throwing', async () => {
        const record = { ...cyrillicMatchRecord(), subject: 'Γιώργος Παπαδόπουλος' };
        await expect(buildCertificatePdf([record], ctx)).resolves.not.toThrow();
    });

    it('still renders plain-ASCII names (no regression from the font swap)', async () => {
        const record = { ...cyrillicMatchRecord(), subject: 'John Smith', matches: [] as ScreeningSummaryRecord['matches'] };
        const pdfBytes = await buildCertificatePdf([record], ctx);
        expect(pdfBytes.length).toBeGreaterThan(0);
    });

    it('renders a batch mixing Latin and Cyrillic subjects on separate pages', async () => {
        const records = [{ ...cyrillicMatchRecord(), subject: 'John Smith', matches: [] as ScreeningSummaryRecord['matches'] }, cyrillicMatchRecord()];
        await expect(buildCertificatePdf(records, ctx)).resolves.not.toThrow();
    });
});
