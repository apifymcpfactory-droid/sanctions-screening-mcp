// MCP-specific option shapes. Everything reusable lives in src/core/types.ts.

import type { SubjectRow } from './core/parseSubjects.js';
import type { EntityTypeFilter, ExportFormat, ListName } from './core/types.js';

export interface ScreenToolOptions {
    entityType?: EntityTypeFilter;
    threshold?: number;
    fuzzy?: boolean;
    lists?: ListName[];
    whitelist?: string[];
    generateCertificate?: boolean;
}

export interface ScreenToolInput extends ScreenToolOptions {
    subjects: SubjectRow[];
}

export interface MonitorToolInput extends ScreenToolOptions {
    subjects: SubjectRow[];
    previousResults: unknown[]; // prior screen_entity/monitor_changes "results" array, passed back by the caller
}

export interface ExportToolInput {
    list: ListName;
    format?: ExportFormat;
}
