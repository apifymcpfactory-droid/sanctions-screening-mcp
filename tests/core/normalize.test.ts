import { describe, expect, it } from 'vitest';

import { normalizeName, significantTokens, transliterate } from '../../src/core/normalize.js';

describe('normalizeName', () => {
    it('lowercases and strips punctuation', () => {
        expect(normalizeName("O'Brien, John.")).toBe('o brien john');
    });

    it('strips diacritics', () => {
        expect(normalizeName('José Muñoz')).toBe('jose munoz');
    });
});

describe('transliterate', () => {
    it('romanises Cyrillic', () => {
        expect(transliterate('Владимир')).toBe('vladimir');
    });

    it('romanises Greek', () => {
        expect(transliterate('Γιώργος')).toBe('giorgos');
    });

    it('leaves Latin text untouched', () => {
        expect(transliterate('John Smith')).toBe('john smith');
    });
});

describe('significantTokens', () => {
    it('drops generic legal-entity suffixes', () => {
        expect(significantTokens('Acme Trading Company Ltd')).toEqual(['acme', 'trading']);
    });

    it('falls back to all tokens if filtering empties the set', () => {
        expect(significantTokens('The Group Ltd')).toEqual(['the', 'group', 'ltd']);
    });
});
