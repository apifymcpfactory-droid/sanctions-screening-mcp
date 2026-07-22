import { describe, expect, it } from 'vitest';

import { normalizeCountry, normalizeName } from '../src/lib/normalize.js';

describe('normalizeName', () => {
    it('lowercases and strips punctuation', () => {
        expect(normalizeName("O'Brien, John.")).toBe('o brien john');
    });

    it('strips diacritics', () => {
        expect(normalizeName('José Muñoz')).toBe('jose munoz');
    });

    it('collapses repeated whitespace', () => {
        expect(normalizeName('Al-Rahman   Group')).toBe('al rahman group');
    });
});

describe('normalizeCountry', () => {
    it('lowercases and strips diacritics', () => {
        expect(normalizeCountry('CUBA')).toBe('cuba');
        expect(normalizeCountry('México')).toBe('mexico');
    });
});
