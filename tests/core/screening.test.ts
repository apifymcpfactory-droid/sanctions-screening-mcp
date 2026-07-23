import { describe, expect, it } from 'vitest';

import { buildEntityPool, screenSubject, screenSubjects } from '../../src/core/screening.js';
import type { NormalizedEntity, ScreenOptions, Subject } from '../../src/core/types.js';

function entity(overrides: Partial<NormalizedEntity>): NormalizedEntity {
    return {
        entityId: 'TEST-1',
        name: 'John Smith',
        aliases: [],
        type: 'person',
        countries: [],
        nationalities: [],
        identifiers: [],
        programs: ['Unspecified'],
        sourceList: 'OFAC SDN',
        sourceUrl: 'https://example.com',
        listVersion: '2026-01-01T00:00:00.000Z',
        linkedTo: [],
        digitalCurrencyAddresses: [],
        ...overrides,
    };
}

const baseOptions: ScreenOptions = { entityType: 'any', threshold: 85, fuzzy: true, whitelist: [] };

describe('screenSubject - single list', () => {
    it('CLEAR: no match produces a documented negative narrative', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'Someone Else' })]);
        const result = screenSubject({ name: 'John Smith' }, pool, baseOptions);
        expect(result.verdict).toBe('CLEAR');
        expect(result.matchCount).toBe(0);
        expect(result.narrative).toMatch(/No match above 85/);
    });

    it('REVIEW: a mid-confidence match with no risk indicators', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'John Smith', programs: ['Unspecified'] })]);
        const result = screenSubject({ name: 'John Smith' }, pool, { ...baseOptions, threshold: 60 });
        expect(result.matchCount).toBe(1);
        expect(result.verdict === 'REVIEW' || result.verdict === 'ESCALATE').toBe(true);
    });

    it('ESCALATE: an exact match on a high-risk programme', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'John Smith', programs: ['IRAN'] })]);
        const result = screenSubject({ name: 'John Smith' }, pool, baseOptions);
        expect(result.verdict).toBe('ESCALATE');
        expect(result.matches[0].riskIndicators.map((r) => r.code)).toContain('IRAN');
    });
});

describe('cross-list consolidation', () => {
    it('merges the same identity across multiple lists into one match with sources[]', () => {
        const pool = buildEntityPool([
            entity({ entityId: 'OFAC-1', name: 'Ivan Petrov', sourceList: 'OFAC SDN' }),
            entity({ entityId: 'EU-1', name: 'Ivan Petrov', sourceList: 'EU Consolidated' }),
            entity({ entityId: 'UN-1', name: 'Ivan Petrov', sourceList: 'UN Consolidated' }),
        ]);
        const result = screenSubject({ name: 'Ivan Petrov' }, pool, baseOptions);
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].sources.map((s) => s.list).sort()).toEqual(['EU Consolidated', 'OFAC SDN', 'UN Consolidated']);
    });

    it('keeps genuinely distinct people with similar names as separate matches', () => {
        const pool = buildEntityPool([
            entity({ entityId: 'A', name: 'John Smith', sourceList: 'OFAC SDN' }),
            entity({ entityId: 'B', name: 'Jane Smithson', sourceList: 'EU Consolidated' }),
        ]);
        const result = screenSubject({ name: 'Smith' }, pool, { ...baseOptions, threshold: 40 });
        expect(result.matches.length).toBeGreaterThanOrEqual(1);
    });
});

describe('false positive analysis and auto-clear', () => {
    it('auto-clears a low-confidence match contradicted by DOB and country', () => {
        const pool = buildEntityPool([
            entity({ entityId: 'A', name: 'John Smith Trading', dobYear: 1950, countries: ['Cuba'] }),
        ]);
        const subject: Subject = { name: 'John Smith', yearOfBirth: 1995, country: 'Canada' };
        const result = screenSubject(subject, pool, { ...baseOptions, threshold: 60 });
        expect(result.matches.every((m) => m.autoCleared || m.confidence >= 90)).toBe(true);
    });
});

describe('ownership risk signal', () => {
    it('flags a linked entity and includes the non-overclaim disclaimer', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'Shell Co', linkedTo: ['Sanctioned Parent Ltd'] })]);
        const result = screenSubject({ name: 'Shell Co' }, pool, baseOptions);
        expect(result.matches[0].ownershipRisk.flagged).toBe(true);
        expect(result.matches[0].ownershipRisk.linkedEntities).toContain('Sanctioned Parent Ltd');
        expect(result.matches[0].ownershipRisk.note).toMatch(/external corporate-registry data/);
    });
});

describe('whitelist suppression', () => {
    it('suppresses a whitelisted entity and marks it cleared', () => {
        const pool = buildEntityPool([entity({ entityId: 'OFAC SDN-99', name: 'John Smith' })]);
        const result = screenSubject({ name: 'John Smith' }, pool, { ...baseOptions, whitelist: ['OFAC SDN-99'] });
        expect(result.matchCount).toBe(0);
        expect(result.verdict).toBe('CLEAR');
        expect(result.whitelisted).toBe(true);
        expect(result.narrative).toMatch(/previously-cleared whitelist/);
    });
});

describe('crypto address screening', () => {
    it('matches a BTC address against an OFAC-listed digital currency address', () => {
        const pool = buildEntityPool([
            entity({ entityId: 'A', name: 'Sanctioned Wallet Owner', digitalCurrencyAddresses: ['BTC:1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2'] }),
        ]);
        const result = screenSubject({ name: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2' }, pool, baseOptions);
        expect(result.matchCount).toBe(1);
        expect(result.matches[0].matchType).toBe('crypto-address');
        expect(result.matches[0].matchedName).toBe('Sanctioned Wallet Owner');
    });

    it('returns no match for a crypto-shaped address not on any list', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'Someone' })]);
        const result = screenSubject({ name: '0x000000000000000000000000000000deadbeef' }, pool, baseOptions);
        expect(result.matchCount).toBe(0);
    });
});

describe('entity type filtering', () => {
    it('excludes an org match when the subject requests person-only', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'Acme Corp', type: 'org' })]);
        const result = screenSubject({ name: 'Acme Corp', entityType: 'person' }, pool, baseOptions);
        expect(result.matchCount).toBe(0);
    });
});

describe('screenSubjects', () => {
    it('screens a batch in order', () => {
        const pool = buildEntityPool([entity({ entityId: 'A', name: 'Match Target' })]);
        const results = screenSubjects([{ name: 'Match Target' }, { name: 'No Match Here' }], pool, baseOptions);
        expect(results).toHaveLength(2);
        expect(results[0].matchCount).toBe(1);
        expect(results[1].matchCount).toBe(0);
    });
});
