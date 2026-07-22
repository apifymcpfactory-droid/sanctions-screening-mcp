// Registry of official sources this Actor screens against. Adding a new
// government list means adding one entry here plus its parser module.

import type { ListName, SanctionRecord } from '../../types.js';
import { EU_LIST_URL, fetchEuList } from './eu.js';
import { fetchOfacConsolidated, fetchOfacSdn, OFAC_CONSOLIDATED_URL, OFAC_SDN_URL } from './ofac.js';
import { fetchUkList, UK_LIST_URL } from './uk.js';
import { fetchUnList, UN_LIST_URL } from './un.js';

export interface SourceDefinition {
    list: ListName;
    sourceUrl: string;
    fetch: () => Promise<SanctionRecord[]>;
}

export const SOURCES: SourceDefinition[] = [
    { list: 'OFAC SDN', sourceUrl: OFAC_SDN_URL, fetch: fetchOfacSdn },
    { list: 'OFAC Consolidated', sourceUrl: OFAC_CONSOLIDATED_URL, fetch: fetchOfacConsolidated },
    { list: 'EU Consolidated', sourceUrl: EU_LIST_URL, fetch: fetchEuList },
    { list: 'UK OFSI', sourceUrl: UK_LIST_URL, fetch: fetchUkList },
    { list: 'UN Consolidated', sourceUrl: UN_LIST_URL, fetch: fetchUnList },
];
