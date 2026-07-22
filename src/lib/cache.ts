// In-memory cache for the 5 official lists.
//
// The Apify Actor version of this tool needed a persistent key-value store
// because each run was a short-lived, separate process. This MCP server is a
// long-lived process instead, so a plain in-memory cache refreshed on a
// daily interval is simpler and sufficient - no external storage needed.
//
// Lists are refreshed ONE AT A TIME (not in parallel) to bound peak memory:
// parsing the ~25-30MB OFAC/EU XML exports simultaneously would multiply
// the transient DOM-parsing memory spike.

import { SOURCES } from './sources/index.js';
import type { ListName, ListStatusEntry, SanctionRecord } from '../types.js';
import { logMem } from './memlog.js';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // small grace window past the daily cadence

interface CachedList {
    records: SanctionRecord[];
    fetchedAt: string;
}

const cache = new Map<ListName, CachedList>();

// Node only exposes global.gc() when started with --expose-gc (see Dockerfile's
// NODE_OPTIONS). Forcing a collection between lists matters here specifically
// because V8 is lazy about reclaiming garbage under memory pressure - without
// this, the previous list's now-dead parse tree can still be sitting in heap
// when the next list's allocations arrive, needlessly compounding peak usage
// in a container with a fixed, fairly tight memory ceiling.
declare const global: typeof globalThis & { gc?: () => void };

async function refreshOne(source: (typeof SOURCES)[number]): Promise<void> {
    try {
        logMem(`before ${source.list}`);
        const records = await source.fetch();
        cache.set(source.list, { records, fetchedAt: new Date().toISOString() });
        console.log(`[sanctions-screening] Refreshed ${source.list}: ${records.length} records`);
        global.gc?.();
        logMem(`after ${source.list} (post-gc)`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[sanctions-screening] Failed to refresh ${source.list}: ${message}`);
        // Keep whatever was already cached - a failed refresh should never wipe good data.
    }
}

async function refreshAllSequentially(): Promise<void> {
    for (const source of SOURCES) {
        await refreshOne(source);
    }
}

// Kicks off the very first load at module init. index.ts awaits this before
// serving the first real tool call; subsequent calls just read the cache.
export const initialLoad: Promise<void> = refreshAllSequentially();

let intervalStarted = false;

// Starts the daily background refresh. Safe to call more than once - only
// the first call schedules the interval. Uses unref() so this timer alone
// never keeps the process alive past a shutdown signal.
export function startBackgroundRefresh(): void {
    if (intervalStarted) return;
    intervalStarted = true;
    const timer = setInterval(() => {
        void refreshAllSequentially();
    }, REFRESH_INTERVAL_MS);
    timer.unref();
}

export function getAllRecords(): SanctionRecord[] {
    const records: SanctionRecord[] = [];
    for (const cached of cache.values()) records.push(...cached.records);
    return records;
}

export function getListStatus(): ListStatusEntry[] {
    return SOURCES.map((source) => {
        const cached = cache.get(source.list);
        const ageMs = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
        return {
            list: source.list,
            recordCount: cached?.records.length ?? 0,
            lastRefreshedAt: cached?.fetchedAt ?? null,
            sourceUrl: source.sourceUrl,
            stale: !cached || ageMs > STALE_AFTER_MS,
        };
    });
}
