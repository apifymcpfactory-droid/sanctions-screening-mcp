// Incrementally extracts flat (non-nested) same-named XML elements from a
// streamed response, so a 25-30MB government export is never held whole in
// memory - either as raw text or as a parsed DOM. Each caller feeds this a
// chunk generator (see http.ts) and gets back complete `<tag>...</tag>`
// strings one at a time, each small enough to hand to a real XML parser on
// its own.
//
// None of OFAC's <sdnEntry>, EU's <sanctionEntity>, or UN's
// <INDIVIDUAL>/<ENTITY> elements nest inside another of the same name, so
// scanning for literal open/close tag pairs across the rolling buffer is
// safe - a real streaming SAX parser would handle the general case, but this
// covers every source this tool reads without that dependency.
export async function* iterateXmlElements(
    chunks: AsyncGenerator<string>,
    tagName: string,
): AsyncGenerator<string> {
    const openPrefix = `<${tagName}`;
    const closeTag = `</${tagName}>`;
    let buffer = '';

    const isNameBoundary = (ch: string | undefined): boolean =>
        ch === '>' || ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === '/';

    for await (const chunk of chunks) {
        buffer += chunk;

        let searchFrom = 0;
        for (;;) {
            const openIdx = buffer.indexOf(openPrefix, searchFrom);
            if (openIdx === -1) {
                // Keep only a small tail in case the open tag straddles this
                // chunk boundary; everything before it is fully consumed.
                const tailStart = Math.max(0, buffer.length - openPrefix.length);
                buffer = buffer.slice(tailStart);
                break;
            }
            if (!isNameBoundary(buffer[openIdx + openPrefix.length])) {
                searchFrom = openIdx + openPrefix.length;
                continue;
            }

            const closeIdx = buffer.indexOf(closeTag, openIdx);
            if (closeIdx === -1) {
                // Element isn't fully buffered yet - drop everything before
                // it (already scanned, no match) and wait for more chunks.
                buffer = buffer.slice(openIdx);
                break;
            }

            const end = closeIdx + closeTag.length;
            yield buffer.slice(openIdx, end);
            searchFrom = end;
        }
    }
}
