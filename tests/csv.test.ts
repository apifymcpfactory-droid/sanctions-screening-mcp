import { describe, expect, it } from 'vitest';

import { parseCsvLine } from '../src/lib/csv.js';

describe('parseCsvLine', () => {
    it('splits plain comma-separated fields', () => {
        expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
    });

    it('handles a quoted field containing a comma', () => {
        expect(parseCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
    });

    it('unescapes doubled quotes inside a quoted field', () => {
        expect(parseCsvLine('a,"b""c",d')).toEqual(['a', 'b"c', 'd']);
    });

    it('handles an entirely empty field', () => {
        expect(parseCsvLine('a,,c')).toEqual(['a', '', 'c']);
    });

    it('handles a trailing empty field', () => {
        expect(parseCsvLine('a,b,')).toEqual(['a', 'b', '']);
    });

    it('handles a quoted field with multiple escaped quotes', () => {
        expect(parseCsvLine('"""a""","b"')).toEqual(['"a"', 'b']);
    });

    it('handles a realistic OFSI-style row', () => {
        const line = 'HAQ,Mian,Abdul,,,,Mr,,,,,,,Pakistan,,,,,Cleric,,,,,,,,Pakistan,"Statement of reasons.",Individual,Primary name,,Global Human Rights,09/12/2022,09/12/2022,09/12/2022,15672';
        const fields = parseCsvLine(line);
        expect(fields[0]).toBe('HAQ');
        expect(fields[1]).toBe('Mian');
        expect(fields[27]).toBe('Statement of reasons.');
        expect(fields[35]).toBe('15672');
        expect(fields).toHaveLength(36);
    });
});
