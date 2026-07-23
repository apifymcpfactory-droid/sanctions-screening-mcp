// Renders a plain-text "Sanctions Screening Certificate" PDF: one page per
// subject, text-only (no images/fonts beyond the built-in Helvetica), so a
// batch of hundreds of subjects still stays a few MB at most - nowhere near
// the memory profile of the list downloads this tool has to be careful
// about elsewhere.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

import type { AuditListEntry, ScreeningSummaryRecord } from './types.js';

const MAX_MATCHES_SHOWN = 8;
const PAGE_WIDTH = 612; // US Letter
const PAGE_HEIGHT = 792;
const MARGIN = 54;

export interface CertificateContext {
    lists: AuditListEntry[];
    threshold: number;
    fuzzy: boolean;
    matchMethod: string;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (candidate.length > maxCharsPerLine) {
            if (current) lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) lines.push(current);
    return lines;
}

export async function buildCertificatePdf(records: ScreeningSummaryRecord[], ctx: CertificateContext): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const screenedOn = new Date().toISOString();

    for (const record of records) {
        const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        let y = PAGE_HEIGHT - MARGIN;
        const drawLine = (text: string, size: number, useBold = false, color = rgb(0.1, 0.1, 0.1)): void => {
            for (const line of wrapText(text, 92)) {
                page.drawText(line, { x: MARGIN, y, size, font: useBold ? bold : font, color });
                y -= size + 6;
            }
        };

        drawLine('Sanctions Screening Certificate', 18, true);
        y -= 6;
        drawLine(`Subject: ${record.subject}`, 12, true);
        drawLine(`Screened on: ${screenedOn}`, 10);
        drawLine(`Method: ${ctx.matchMethod} | Threshold: ${ctx.threshold} | Fuzzy: ${ctx.fuzzy ? 'on' : 'off'}`, 10);
        y -= 4;

        drawLine('Lists screened:', 11, true);
        for (const list of ctx.lists) {
            drawLine(`  - ${list.list} (v. ${list.listVersion}, ${list.recordCount} records, fetched ${list.fetchedAt})`, 9);
        }
        y -= 6;

        const verdictColor =
            record.verdict === 'CLEAR' ? rgb(0.1, 0.5, 0.1) : record.verdict === 'REVIEW' ? rgb(0.6, 0.45, 0) : rgb(0.7, 0.1, 0.1);
        drawLine(`Verdict: ${record.verdict}`, 14, true, verdictColor);
        drawLine(`Recommended action: ${record.recommendedAction}`, 10);
        drawLine(`Narrative: ${record.narrative}`, 10);
        y -= 6;

        if (record.matches.length === 0) {
            drawLine('No matches.', 10);
        } else {
            drawLine(`Matches (${record.matches.length}):`, 11, true);
            for (const match of record.matches.slice(0, MAX_MATCHES_SHOWN)) {
                const sourceList = match.sources.map((s) => s.list).join(', ');
                drawLine(`  - ${match.matchedName} | confidence ${match.confidence} | ${match.matchType} | sources: ${sourceList}`, 9);
                if (match.riskIndicators.length > 0) {
                    drawLine(`    risk: ${match.riskIndicators.map((r) => r.code).join(', ')}`, 9);
                }
            }
            if (record.matches.length > MAX_MATCHES_SHOWN) {
                drawLine(`  ... and ${record.matches.length - MAX_MATCHES_SHOWN} more match(es); see the full JSON result.`, 9);
            }
        }

        page.drawText('Screened by Howth Technology Factory', {
            x: MARGIN,
            y: MARGIN / 2,
            size: 8,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });
    }

    return doc.save();
}
