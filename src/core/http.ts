// Streaming HTTP helper for the official list downloads. These are large
// (multi-MB to multi-hundred-MB) government/OpenSanctions-hosted files, so we
// never buffer a full response body in memory: every caller consumes the
// response as a sequence of decoded text chunks and turns those into records
// incrementally (see xmlChunks.ts and csv.ts).

const FETCH_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 2_000;
export const USER_AGENT = 'Mozilla/5.0 (compatible; sanctions-screening/2.0; +https://apify.com/apifmcpfactory)';

const sleep = async (ms: number): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

async function openStream(url: string): Promise<Response> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
                redirect: 'follow',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            });
            if (!response.ok || !response.body) {
                throw new Error(`HTTP ${response.status} fetching ${url}`);
            }
            return response;
        } catch (error) {
            lastError = error;
            if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_BASE_MS * attempt);
        }
    }
    const message = lastError instanceof Error ? lastError.message : String(lastError);
    throw new Error(`Failed to fetch ${url} after ${MAX_ATTEMPTS} attempts: ${message}`);
}

// Yields the response body as decoded UTF-8 text chunks, in order, without
// ever holding more than one chunk (plus each parser's small rolling buffer)
// in memory at once. `TextDecoder` with `stream: true` correctly buffers any
// multi-byte UTF-8 character split across a chunk boundary internally.
export async function* streamTextChunks(url: string): AsyncGenerator<string> {
    const response = await openStream(url);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder('utf-8');
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            yield decoder.decode(value, { stream: true });
        }
        const tail = decoder.decode();
        if (tail) yield tail;
    } finally {
        reader.releaseLock();
    }
}

// For the rare case a caller genuinely needs the whole body (used only for
// the UK OFSI file, which is a few MB and has no natural per-record streaming
// boundary cheaper than reading it whole). Still goes through the same
// retrying stream reader rather than a second code path.
export async function fetchListFile(url: string): Promise<string> {
    const parts: string[] = [];
    for await (const chunk of streamTextChunks(url)) parts.push(chunk);
    return parts.join('');
}
