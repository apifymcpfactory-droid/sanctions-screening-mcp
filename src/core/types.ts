// Shared types for the sanctions-screening core. Nothing in src/core may
// import a platform SDK (apify, express, @modelcontextprotocol/sdk) - this
// module tree is copied verbatim between the Apify actor repo and the
// MCPize server repo, so it must stay pure and self-contained.

export type EntityType = 'person' | 'org' | 'other';
export type EntityTypeFilter = 'any' | EntityType;

export type ListName =
    | 'OFAC SDN'
    | 'OFAC Consolidated'
    | 'EU Consolidated'
    | 'UK OFSI'
    | 'UN Consolidated'
    | 'OpenSanctions Sanctions'
    | 'OpenSanctions PEP';

// One normalised entry from an official list or watchlist dataset, regardless
// of source - every parser in src/core/sources produces this shape.
export interface NormalizedEntity {
    entityId: string;
    name: string;
    aliases: string[];
    type: EntityType;
    dob?: string; // ISO date (YYYY-MM-DD) when the source gives a full date
    dobYear?: number; // year-only when that is all the source gives
    countries: string[];
    nationalities: string[];
    identifiers: string[]; // e.g. "passport:AB1234567", "lei:5493001KJTIIGC8Y1R12"
    programs: string[];
    sourceList: ListName;
    sourceUrl: string;
    listVersion: string; // fetch timestamp (ISO) this record was pulled at
    linkedTo: string[]; // names the source lists as linked/owned/controlled by this entity
    digitalCurrencyAddresses: string[]; // e.g. "BTC:1abc...", "ETH:0xabc..."
    details?: string;
}

export interface ListStatusEntry {
    list: ListName;
    recordCount: number;
    lastRefreshedAt: string | null;
    sourceUrl: string;
    stale: boolean;
}

// ---- Subjects (screen mode input) -----------------------------------------

export interface Subject {
    name: string;
    entityType?: EntityTypeFilter;
    yearOfBirth?: number;
    dob?: string;
    country?: string;
    nationality?: string;
    idNumber?: string;
    passport?: string;
    regNumber?: string;
    lei?: string;
    program?: string;
}

// ---- Screening result -------------------------------------------------------

export type Verdict = 'CLEAR' | 'REVIEW' | 'ESCALATE';

export type MatchType = 'exact' | 'strong-fuzzy' | 'fuzzy' | 'alias' | 'transliteration' | 'crypto-address';

export interface RiskIndicator {
    code: string; // IRAN, RUSSIA-EO14024, DPRK, CYBER, TERRORISM, ...
    label: string;
}

export interface FalsePositiveAnalysis {
    mismatchSignals: string[];
    likelyFalsePositive: boolean;
    reason: string;
}

export interface OwnershipRisk {
    flagged: boolean;
    linkedEntities: string[];
    note: string;
}

export interface MatchSource {
    list: ListName;
    entityId: string;
    program: string;
    listVersion: string;
    sourceUrl: string;
}

export interface ConsolidatedMatch {
    matchedName: string;
    aliasHit?: string;
    confidence: number;
    matchType: MatchType;
    sources: MatchSource[];
    riskIndicators: RiskIndicator[];
    falsePositiveAnalysis: FalsePositiveAnalysis;
    autoCleared: boolean;
    ownershipRisk: OwnershipRisk;
}

export interface ScreeningSummaryRecord {
    subject: string;
    verdict: Verdict;
    recommendedAction: string;
    priorityScore: number;
    matchCount: number;
    highestConfidence: number;
    narrative: string;
    matches: ConsolidatedMatch[];
    whitelisted: boolean;
}

export interface ScreenOptions {
    entityType: EntityTypeFilter;
    threshold: number;
    fuzzy: boolean;
    lists?: ListName[];
    whitelist: string[];
}

// ---- Monitor mode -----------------------------------------------------------

export interface MonitorChange {
    subject: string;
    changeType: 'new-hit' | 'newly-cleared' | 'list-version-changed' | 'score-changed';
    detail: string;
    current: ScreeningSummaryRecord;
    previous?: ScreeningSummaryRecord;
}

export interface MonitorResult {
    mode: 'monitor';
    changedCount: number;
    unchangedCount: number;
    changes: MonitorChange[];
    checkedAt: string;
}

// ---- Export mode --------------------------------------------------------------

export type ExportFormat = 'csv' | 'json' | 'xlsx';

export interface ExportResult {
    mode: 'export';
    list: ListName;
    format: ExportFormat;
    recordCount: number;
    listVersion: string;
}

// ---- Audit ------------------------------------------------------------------

export interface AuditListEntry {
    list: ListName;
    listVersion: string;
    fetchedAt: string;
    sourceUrl: string;
    recordCount: number;
}

export interface AuditSummary {
    runId: string;
    generatedAt: string;
    mode: 'screen' | 'monitor' | 'export';
    lists: AuditListEntry[];
    matchMethod: string;
    threshold: number;
    fuzzy: boolean;
    subjectCount: number;
    verdictCounts: Record<Verdict, number>;
    subjects: Array<{ subject: string; verdict: Verdict; matchCount: number; highestConfidence: number }>;
}
