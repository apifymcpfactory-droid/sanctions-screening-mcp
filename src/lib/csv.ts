// Minimal RFC-4180 CSV line splitter (handles quoted fields, escaped "" quotes,
// and commas/newlines inside quotes are not needed here since OFSI's export is
// one record per line). Used only by the UK OFSI parser.
//
// Builds each field via slice() at segment boundaries (comma/quote
// transitions) rather than character-by-character concatenation - for a
// ~20,000-row file, `+=` one character at a time adds up to millions of tiny
// string allocations, which was spiking memory faster than GC could reclaim
// it in a memory-constrained container.

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
