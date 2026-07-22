export type EntityTypeFilter = 'any' | 'person' | 'org';

export type RecordEntityType = 'person' | 'org' | 'other';

export type ListName = 'OFAC SDN' | 'OFAC Consolidated' | 'EU Consolidated' | 'UK OFSI' | 'UN Consolidated';

// One normalised entry from an official sanctions/watch list, regardless of
// which source it came from - every parser in src/lib/sources produces this shape.
export interface SanctionRecord {
    entityId: string;
    list: ListName;
    program: string;
    entityType: RecordEntityType;
    primaryName: string;
    aliases: string[];
    country?: string;
    details?: string;
}

export interface MatchDetail {
    matchedName: string;
    list: ListName;
    program: string;
    entityType: RecordEntityType;
    score: number;
    entityId: string;
    details?: string;
}

export interface ListStatusEntry {
    list: ListName;
    recordCount: number;
    lastRefreshedAt: string | null;
    sourceUrl: string;
    stale: boolean;
}
