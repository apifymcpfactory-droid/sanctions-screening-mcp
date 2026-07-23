// Minimal RFC-4180 CSV helpers: a per-line field splitter, plus an
// incremental line reader that consumes a streamed chunk generator (see
// http.ts) without ever buffering the whole file - only the current
// in-progress line (plus a small chunk-sized remainder) is held at once.
// Splitting is quote-aware: a newline inside an open quoted field does not
// end the row, so a free-text field containing a literal newline is still
// handled correctly.

export function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    const parts: string[] = [];
    let segStart = 0;
    let inQuotes = false;
    const len = line.length;

    const flushSegment = (end: number): void => {
        if (end > segStart) parts.push(line.slice(segStart, end));
    };
    const flushField = (): void => {
        fields.push(parts.length === 1 ? parts[0] : parts.join(''));
        parts.length = 0;
    };

    let i = 0;
    while (i < len) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"') {
                flushSegment(i);
                if (line[i + 1] === '"') {
                    parts.push('"');
                    i += 2;
                    segStart = i;
                    continue;
                }
                inQuotes = false;
                segStart = i + 1;
            }
        } else if (char === '"') {
            flushSegment(i);
            inQuotes = true;
            segStart = i + 1;
        } else if (char === ',') {
            flushSegment(i);
            flushField();
            segStart = i + 1;
        }
        i++;
    }
    flushSegment(len);
    flushField();
    return fields;
}

export async function* iterateCsvLines(chunks: AsyncGenerator<string>): AsyncGenerator<string> {
    let buffer = '';
    let scanFrom = 0;
    let inQuotes = false;

    for await (const chunk of chunks) {
        buffer += chunk;

        while (scanFrom < buffer.length) {
            const char = buffer[scanFrom];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                const line = buffer.slice(0, scanFrom);
                if (line.length > 0) yield line;
                // Swallow a \r\n pair as one line break.
                const skipTwo = char === '\r' && buffer[scanFrom + 1] === '\n';
                buffer = buffer.slice(scanFrom + (skipTwo ? 2 : 1));
                scanFrom = 0;
                continue;
            }
            scanFrom++;
        }
    }
    if (buffer.trim().length > 0) yield buffer;
}
