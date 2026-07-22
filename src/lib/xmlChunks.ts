// Splits a flat (non-nested) run of same-named XML elements into their raw
// text chunks, so each can be parsed individually instead of building one
// whole-document DOM tree in memory.
//
// The government list exports this server processes run 25-30MB+, and a
// single fast-xml-parser pass over a document that size builds a JS object
// graph large enough (~400MB+ observed) to threaten a memory-constrained
// container on its own. None of OFAC's <sdnEntry>, EU's <sanctionEntity>, or
// UN's <INDIVIDUAL>/<ENTITY> elements nest inside another of the same name,
// so scanning for literal open/close tag pairs is safe and avoids a real XML
// parser needing to hold the whole document at once.
export function* iterateXmlElements(xml: string, tagName: string): Generator<string> {
    const openPrefix = `<${tagName}`;
    const closeTag = `</${tagName}>`;
    let searchFrom = 0;

    for (;;) {
        const openIdx = xml.indexOf(openPrefix, searchFrom);
        if (openIdx === -1) return;

        // Guard against a longer tag name sharing this prefix (e.g. "<sdnEntryFoo").
        const afterName = xml[openIdx + openPrefix.length];
        if (afterName !== '>' && afterName !== ' ' && afterName !== '\n' && afterName !== '\t' && afterName !== '\r') {
            searchFrom = openIdx + openPrefix.length;
            continue;
        }

        const closeIdx = xml.indexOf(closeTag, openIdx);
        if (closeIdx === -1) return;

        const end = closeIdx + closeTag.length;
        yield xml.slice(openIdx, end);
        searchFrom = end;
    }
}
