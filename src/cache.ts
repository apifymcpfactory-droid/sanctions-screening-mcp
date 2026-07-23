// In-memory cache for the 5 official lists this surface screens (see
// core/sources/index.ts for why it's 5, not the Apify actor's 7).
//
// The Apify Actor version needs a persistent key-value store because each
// run is a short-lived, separate process. This MCP server is a long-lived
// process instead, so a plain in-memory cache refreshed on a daily interval
// is simpler and sufficient - no external storage needed.
//
// Lists are refreshed ONE AT A TIME (not in parallel) to bound peak memory:
// parsing the ~25-30MB OFAC/EU XML exports simultaneously would multiply the
// transient DOM-parsing memory spike in an already memory-constrained
// container (see Dockerfile).

import { buildEntityPool, type EntityPool } from './core/screening.js';
import { SOURCES } from './core/sources/index.js';
import type { AuditListEntry, ListName, ListStatusEntry, NormalizedEntity } from './core/types.js';
import { logMem } from './memlog.js';

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const STALE_AFTER_MS = 26 * 60 * 60 * 1000; // small grace window past the daily cadence

interface CachedList {
    records: NormalizedEntity[];
    fetchedAt: string;
}

const cache = new Map<ListName, CachedList>();
let pool: EntityPool = buildEntityPool([]);

// Node only exposes global.gc() when started with --expose-gc (see
// Dockerfile's NODE_OPTIONS). Forcing a collection between lists matters
// here specifically because V8 is lazy about reclaiming garbage under memory
// pressure - without this, the previous list's now-dead parse tree can still
// be sitting in heap when the next list's allocations arrive, needlessly
// compounding peak usage in a container with a fixed, fairly tight memory
// ceiling.
declare const global: typeof globalThis & { gc?: () => void };

async function refreshOne(source: (typeof SOURCES)[number]): Promise<void> {
    try {
        logMem(`before ${source.list}`);
        const records: NormalizedEntity[] = [];
        for await (const record of source.fetch()) records.push(record);
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

function rebuildPool(): void {
    const all: NormalizedEntity[] = [];
    for (const cached of cache.values()) all.push(...cached.records);
    pool = buildEntityPool(all);
    logMem('after pool rebuild');
}

async function refreshAllSequentially(): Promise<void> {
    for (const source of SOURCES) await refreshOne(source);
    rebuildPool();
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

export function getPool(): EntityPool {
    return pool;
}

export function getCachedListRecords(list: ListName): NormalizedEntity[] | null {
    return cache.get(list)?.records ?? null;
}

export function getAuditLists(): AuditListEntry[] {
    return SOURCES.map((source) => {
        const cached = cache.get(source.list);
        return {
            list: source.list,
            listVersion: cached?.records[0]?.listVersion ?? cached?.fetchedAt ?? 'unavailable',
            fetchedAt: cached?.fetchedAt ?? 'unavailable',
            sourceUrl: source.sourceUrl,
            recordCount: cached?.records.length ?? 0,
        };
    });
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
