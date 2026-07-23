// Registry of sources THIS SURFACE (the MCPize server) screens against.
//
// Deliberately 5 lists, not the Apify actor's 7: this server runs in a
// FIXED 512Mi Cloud Run container (see ../../../Dockerfile - "not
// configurable via mcpize.yaml") with --max-old-space-size=350 already
// tuned against real observed memory for OFAC/EU/UK/UN alone. OpenSanctions'
// sanctions+PEP collections add on the order of 100,000+ permanently-resident
// records (this server caches records in-process for its whole lifetime,
// unlike the Apify actor's per-run process) - comfortably enough to risk
// reproducing the exact OOM this tool was previously patched for. The Apify
// actor surface (defaultMemoryMbytes: 4096) carries OpenSanctions instead;
// see src/core/sources/openSanctions.ts, which stays in this repo's mirrored
// core for parity but is intentionally not registered below.
//
// If MCPize ever offers a larger container tier for this deployment, add
// OpenSanctions here the same way the Apify actor's sources/index.ts does.

import type { ListName, NormalizedEntity } from '../types.js';
import { EU_LIST_URL, fetchEuList } from './eu.js';
import { fetchOfacConsolidated, fetchOfacSdn, OFAC_CONSOLIDATED_URL, OFAC_SDN_URL } from './ofac.js';
import { fetchUkList, UK_LIST_URL } from './uk.js';
import { fetchUnList, UN_LIST_URL } from './un.js';

export interface SourceDefinition {
    list: ListName;
    sourceUrl: string;
    fetch: () => AsyncGenerator<NormalizedEntity>;
}

export const SOURCES: SourceDefinition[] = [
    { list: 'OFAC SDN', sourceUrl: OFAC_SDN_URL, fetch: fetchOfacSdn },
    { list: 'OFAC Consolidated', sourceUrl: OFAC_CONSOLIDATED_URL, fetch: fetchOfacConsolidated },
    { list: 'EU Consolidated', sourceUrl: EU_LIST_URL, fetch: fetchEuList },
    { list: 'UK OFSI', sourceUrl: UK_LIST_URL, fetch: fetchUkList },
    { list: 'UN Consolidated', sourceUrl: UN_LIST_URL, fetch: fetchUnList },
];
