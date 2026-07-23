import { describe, expect, it } from 'vitest';

import { matchAgainstName, scoreNames } from '../../src/core/match.js';

describe('scoreNames', () => {
    it('scores identical names 100', () => {
        expect(scoreNames('John Smith', 'John Smith')).toBe(100);
    });

    it('is insensitive to token order', () => {
        expect(scoreNames('Smith John', 'John Smith')).toBe(100);
    });

    it('does not inflate scores from a single shared generic word', () => {
        // Monge-Elkan token alignment must keep an otherwise-unrelated pair
        // well below a realistic screening threshold, even though both
        // share the (filtered-out) generic word "Company".
        const score = scoreNames('Acme Test Company', 'Metil Steel Company');
        expect(score).toBeLessThan(85);
    });

    it('scores a close typo highly but not perfectly', () => {
        const score = scoreNames('Aleksandr Petrov', 'Alexander Petrov');
        expect(score).toBeGreaterThan(80);
        expect(score).toBeLessThan(100);
    });
});

describe('matchAgainstName', () => {
    it('flags an exact match', () => {
        const outcome = matchAgainstName('John Smith', 'John Smith', true);
        expect(outcome).toEqual({ score: 100, matchType: 'exact' });
    });

    it('matches a transliterated Cyrillic name against its Latin rendering', () => {
        const outcome = matchAgainstName('Vladimir Putin', 'Владимир Путин', true);
        expect(outcome.score).toBeGreaterThanOrEqual(90);
        expect(['transliteration', 'strong-fuzzy']).toContain(outcome.matchType);
    });

    it('non-fuzzy mode rejects a near match that is not exact', () => {
        const outcome = matchAgainstName('Jon Smith', 'John Smith', false);
        expect(outcome.score).toBe(0);
    });

    it('non-fuzzy mode still allows punctuation-only differences through', () => {
        const outcome = matchAgainstName('John Smith', "John Smith.", false);
        expect(outcome.score).toBeGreaterThanOrEqual(98);
    });
});
