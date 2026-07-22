// Shared HTTP helper for pulling the official list files. These are large
// (multi-MB XML/CSV) government-hosted downloads, so we retry transient
// failures with backoff rather than fail the whole cache refresh on one hiccup.

const FETCH_TIMEOUT_MS = 60_000;
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 2_000;
export const USER_AGENT = 'Mozilla/5.0 (compatible; sanctions-screening-mcp/1.0; +https://mcpize.com)';

const sleep = async (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

export async function fetchListFile(url: string): Promise<string> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
                redirect: 'follow',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} fetching ${url}`);
            }
            return await response.text();
        } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[sanctions-screening] Fetch attempt ${attempt}/${MAX_ATTEMPTS} failed for ${url}: ${message}`);
            if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_BASE_MS * attempt);
        }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to fetch ${url} after ${MAX_ATTEMPTS} attempts: ${message}`);
}
