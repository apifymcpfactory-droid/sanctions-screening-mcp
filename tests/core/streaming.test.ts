import { describe, expect, it } from 'vitest';

import { iterateCsvLines, parseCsvLine } from '../../src/core/csv.js';
import { iterateXmlElements } from '../../src/core/xmlChunks.js';

async function* chunksOf(text: string, size: number): AsyncGenerator<string> {
    for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size);
}

describe('iterateXmlElements', () => {
    const xml = '<root><sdnEntry><uid>1</uid></sdnEntry><sdnEntry><uid>2</uid></sdnEntry></root>';

    it('extracts every element when the whole document arrives in one chunk', async () => {
        const found: string[] = [];
        for await (const el of iterateXmlElements(chunksOf(xml, xml.length), 'sdnEntry')) found.push(el);
        expect(found).toHaveLength(2);
        expect(found[0]).toContain('<uid>1</uid>');
        expect(found[1]).toContain('<uid>2</uid>');
    });

    it('extracts every element correctly even when a tag straddles a chunk boundary', async () => {
        const found: string[] = [];
        for await (const el of iterateXmlElements(chunksOf(xml, 7), 'sdnEntry')) found.push(el);
        expect(found).toHaveLength(2);
        expect(found[0]).toBe('<sdnEntry><uid>1</uid></sdnEntry>');
        expect(found[1]).toBe('<sdnEntry><uid>2</uid></sdnEntry>');
    });

    it('does not confuse a longer tag name sharing the same prefix', async () => {
        const tricky = '<sdnEntryFoo>ignored</sdnEntryFoo><sdnEntry><uid>3</uid></sdnEntry>';
        const found: string[] = [];
        for await (const el of iterateXmlElements(chunksOf(tricky, 5), 'sdnEntry')) found.push(el);
        expect(found).toHaveLength(1);
        expect(found[0]).toBe('<sdnEntry><uid>3</uid></sdnEntry>');
    });
});

describe('iterateCsvLines', () => {
    it('splits on newlines when the whole file arrives in one chunk', async () => {
        const csv = 'a,b,c\n1,2,3\n4,5,6';
        const lines: string[] = [];
        for await (const line of iterateCsvLines(chunksOf(csv, csv.length))) lines.push(line);
        expect(lines).toEqual(['a,b,c', '1,2,3', '4,5,6']);
    });

    it('splits correctly when a line straddles a chunk boundary', async () => {
        const csv = 'a,b,c\n1,2,3\n4,5,6\n';
        const lines: string[] = [];
        for await (const line of iterateCsvLines(chunksOf(csv, 4))) lines.push(line);
        expect(lines).toEqual(['a,b,c', '1,2,3', '4,5,6']);
    });

    it('does not split on a newline inside a quoted field', async () => {
        const csv = 'a,b\n"line1\nline2",2\n';
        const lines: string[] = [];
        for await (const line of iterateCsvLines(chunksOf(csv, 3))) lines.push(line);
        expect(lines).toHaveLength(2);
        expect(parseCsvLine(lines[1])).toEqual(['line1\nline2', '2']);
    });
});

describe('parseCsvLine', () => {
    it('handles quoted fields with escaped quotes', () => {
        expect(parseCsvLine('a,"He said ""hi""",c')).toEqual(['a', 'He said "hi"', 'c']);
    });
});
