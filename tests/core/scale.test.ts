// Regression test for the production incident where `allRecords.push(...cached.records)`
// in cache.ts threw "Maximum call stack size exceeded" once OpenSanctions'
// 150,000-record PEP collection made the spread-into-call-arguments blow past
// V8's argument-count limit. Small unit-test fixtures never exercised this -
// the bug only shows up at real list scale, which is what this test forces.

import { describe, expect, it } from 'vitest';

import { maxOf, pushAll } from '../../src/core/arrayUtils.js';
import { buildEntityPool, screenSubject } from '../../src/core/screening.js';
import type { NormalizedEntity, ScreenOptions } from '../../src/core/types.js';

const RECORD_COUNT = 220_000; // above the ~65,536 V8 argument-count ceiling that broke production

// Varied first/last name pools so no single token is shared across all
// synthetic entities - a real list's names are similarly varied. Reusing one
// literal word (e.g. "Person") in every name would degenerate the blocking
// index (screening.ts) into one giant bucket and turn every screen into a
// full linear scan - a real performance concern, but a different bug from
// the one this file regresses, so the fixture must not manufacture it.
const FIRST_NAMES = ['Aleksandr', 'Bianca', 'Chidi', 'Dorothea', 'Esteban', 'Farida', 'Gunnar', 'Hiroko', 'Ines', 'Jorge'];
const LAST_NAMES = ['Volkov', 'Marchetti', 'Okafor', 'Nilsson', 'Reyes', 'Haddad', 'Kowalski', 'Tanaka', 'Duarte', 'Novak'];

function makeEntity(i: number): NormalizedEntity {
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]} ${i}`;
    return {
        entityId: `SYNTH-${i}`,
        name,
        aliases: [`${name} Alias`],
        type: 'person',
        countries: [],
        nationalities: [],
        identifiers: [],
        programs: ['Unspecified'],
        sourceList: 'OpenSanctions PEP',
        sourceUrl: 'https://example.com',
        listVersion: '2026-01-01T00:00:00.000Z',
        linkedTo: [],
        digitalCurrencyAddresses: [],
    };
}

describe('pushAll at OpenSanctions scale', () => {
    it('pushes 220,000 elements without a stack overflow (the exact failure mode this regresses)', () => {
        const source = Array.from({ length: RECORD_COUNT }, (_, i) => i);
        const target: number[] = [];
        expect(() => pushAll(target, source)).not.toThrow();
        expect(target).toHaveLength(RECORD_COUNT);
        expect(target[0]).toBe(0);
        expect(target[RECORD_COUNT - 1]).toBe(RECORD_COUNT - 1);
    });

    it('replicates cache.ts assembling multiple large lists into one array', () => {
        // Mirrors cache.ts's getScreeningData loop: several lists, one of
        // which alone exceeds the argument-count ceiling, pushed sequentially
        // into one accumulator.
        const listSizes = [19241, 481, 6017, 5135, 1011, 71456, 150000]; // real counts observed in production
        const allRecords: NormalizedEntity[] = [];
        for (const size of listSizes) {
            const listRecords = Array.from({ length: size }, (_, i) => makeEntity(i));
            expect(() => pushAll(allRecords, listRecords)).not.toThrow();
        }
        expect(allRecords).toHaveLength(listSizes.reduce((a, b) => a + b, 0));
    });
});

describe('maxOf at scale', () => {
    it('finds the max of 220,000 values without a stack overflow', () => {
        const values = Array.from({ length: RECORD_COUNT }, (_, i) => i);
        expect(() => maxOf(values)).not.toThrow();
        expect(maxOf(values)).toBe(RECORD_COUNT - 1);
    });

    it('matches Math.max semantics on small arrays', () => {
        expect(maxOf([3, 1, 4, 1, 5, 9, 2, 6])).toBe(9);
    });
});

describe('normalize + merge path over 200k+ synthetic records (regression for the reported incident)', () => {
    it('builds an entity pool from 220,000 records without throwing', () => {
        const entities = Array.from({ length: RECORD_COUNT }, (_, i) => makeEntity(i));
        expect(() => buildEntityPool(entities)).not.toThrow();
    });

    it('screens a subject against a 220,000-record pool end-to-end without throwing', { timeout: 20_000 }, () => {
        const entities = Array.from({ length: RECORD_COUNT }, (_, i) => makeEntity(i));
        // Give a handful of entities near-duplicate names so cross-list
        // consolidation (merge.ts) also runs its pairwise clustering pass on
        // a non-trivial candidate set, not just zero or one match.
        entities[10] = { ...entities[10], name: 'Target Match Person', sourceList: 'OFAC SDN' };
        entities[11] = { ...entities[11], name: 'Target Match Person', sourceList: 'EU Consolidated' };
        entities[12] = { ...entities[12], name: 'Target Match Person', sourceList: 'UN Consolidated' };

        const pool = buildEntityPool(entities);
        const options: ScreenOptions = { entityType: 'any', threshold: 85, fuzzy: true, whitelist: [] };

        let result;
        expect(() => {
            result = screenSubject({ name: 'Target Match Person' }, pool, options);
        }).not.toThrow();
        expect(result!.matchCount).toBe(1); // the 3 near-duplicate entries consolidate into one match
        expect(result!.matches[0].sources).toHaveLength(3);
    });
});
