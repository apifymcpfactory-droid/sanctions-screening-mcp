import { describe, expect, it } from 'vitest';

import { scoreNames } from '../src/lib/match.js';

describe('scoreNames', () => {
    it('scores an exact match at 100', () => {
        expect(scoreNames('Vladimir Putin', 'Vladimir Putin')).toBe(100);
    });

    it('scores a case/punctuation-only difference at 100', () => {
        expect(scoreNames('vladimir putin', 'VLADIMIR, PUTIN.')).toBe(100);
    });

    it('scores reordered tokens (surname-first vs given-name-first) highly', () => {
        expect(scoreNames('John Smith', 'Smith John')).toBe(100);
    });

    it('scores a close misspelling highly but below 100', () => {
        const score = scoreNames('Aeroflot Airlines', 'Aeroflott Airlines');
        expect(score).toBeGreaterThanOrEqual(90);
        expect(score).toBeLessThan(100);
    });

    it('scores unrelated names below the default match threshold', () => {
        expect(scoreNames('John Smith', 'Acme Test Company')).toBeLessThan(85);
    });

    it('does not let one shared filler word inflate an otherwise unrelated company name', () => {
        // A naive whole-string comparison lets "company" alone drag this above
        // threshold - Monge-Elkan token alignment must keep it well below 85.
        expect(scoreNames('Acme Test Company', 'Metil Steel Company')).toBeLessThan(85);
    });

    it('discounts generic legal-entity suffixes so a short candidate name is not overweighted by them', () => {
        // Regression: "company" being 1 of 2 tokens in "TS Company" let it
        // dominate the Monge-Elkan average against an unrelated short name.
        expect(scoreNames('Acme Test Company', 'TS Company')).toBeLessThan(85);
    });

    it('is deterministic - same inputs always produce the same score', () => {
        const a = scoreNames('AeroCaribbean Airlines', 'Aero-Caribbean');
        const b = scoreNames('AeroCaribbean Airlines', 'Aero-Caribbean');
        expect(a).toBe(b);
    });
});
