import { describe, expect, it } from 'vitest';

import { screenName } from '../src/lib/screening.js';
import type { SanctionRecord } from '../src/types.js';

const RECORDS: SanctionRecord[] = [
    {
        entityId: 'OFAC SDN-1',
        list: 'OFAC SDN',
        program: 'CUBA',
        entityType: 'org',
        primaryName: 'AeroCaribbean Airlines',
        aliases: ['Aero-Caribbean'],
        country: 'Cuba',
        details: 'Cuba-program entity.',
    },
    {
        entityId: 'UN Consolidated-2',
        list: 'UN Consolidated',
        program: 'DRC',
        entityType: 'person',
        primaryName: 'Eric Badege',
        aliases: [],
        country: 'Democratic Republic of the Congo',
    },
];

const BASE_OPTIONS = { entityType: 'any' as const, threshold: 85, includeAliases: true };

describe('screenName', () => {
    it('finds an exact match', () => {
        const result = screenName('AeroCaribbean Airlines', RECORDS, BASE_OPTIONS);
        expect(result.isMatch).toBe(true);
        expect(result.topScore).toBe(100);
        expect(result.matches[0].entityId).toBe('OFAC SDN-1');
    });

    it('matches via alias when includeAliases is true', () => {
        // At threshold 95, only an exact-or-near alias match qualifies - the
        // primary name "AeroCaribbean Airlines" alone scores 87 against this query.
        const strict = { ...BASE_OPTIONS, threshold: 95 };
        const result = screenName('Aero-Caribbean', RECORDS, strict);
        expect(result.isMatch).toBe(true);
        expect(result.matches[0].matchedName).toBe('Aero-Caribbean');
    });

    it('ignores aliases when includeAliases is false', () => {
        const strict = { ...BASE_OPTIONS, threshold: 95, includeAliases: false };
        const result = screenName('Aero-Caribbean', RECORDS, strict);
        expect(result.matches.find((m) => m.entityId === 'OFAC SDN-1')).toBeUndefined();
    });

    it('returns no match for a clean name', () => {
        const result = screenName('Acme Test Company', RECORDS, BASE_OPTIONS);
        expect(result.isMatch).toBe(false);
        expect(result.matches).toHaveLength(0);
    });

    it('filters by entityType', () => {
        const result = screenName('Eric Badege', RECORDS, { ...BASE_OPTIONS, entityType: 'org' });
        expect(result.isMatch).toBe(false);
    });

    it('filters by country', () => {
        const result = screenName('AeroCaribbean Airlines', RECORDS, { ...BASE_OPTIONS, country: 'Russia' });
        expect(result.isMatch).toBe(false);
    });

    it('respects a stricter threshold', () => {
        const lenient = screenName('Aerocaribean Airline', RECORDS, { ...BASE_OPTIONS, threshold: 80 });
        const strict = screenName('Aerocaribean Airline', RECORDS, { ...BASE_OPTIONS, threshold: 99 });
        expect(lenient.isMatch).toBe(true);
        expect(strict.isMatch).toBe(false);
    });
});
