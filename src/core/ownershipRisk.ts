// OFAC's "50% Rule" treats an entity as blocked if one or more sanctioned
// parties own 50%+ of it in aggregate, even if that entity is not itself
// separately listed. This module only signals when the LIST DATA ITSELF
// already names a link (e.g. OFAC's "(Linked To: X)" remarks convention) -
// it does not, and cannot, compute real beneficial-ownership percentages,
// which requires corporate-registry / ownership-graph data this tool does
// not have. Every flagged result says so explicitly so it is never mistaken
// for full 50%-rule coverage.

import type { NormalizedEntity, OwnershipRisk } from './types.js';

export const OWNERSHIP_NO_SIGNAL_NOTE =
    'No ownership/linkage signal found in the source list data for this entry. This is not a full 50%-rule check - ' +
    'beneficial-ownership tracing requires external corporate-registry data this tool does not have.';

export const OWNERSHIP_SIGNAL_NOTE =
    'The source list data names this entity as linked to the entities listed. This is a signal only, not a computed ' +
    'ownership percentage - full 50%-rule beneficial-ownership tracing requires external corporate-registry data this ' +
    'tool does not have.';

export function assessOwnershipRisk(entity: NormalizedEntity): OwnershipRisk {
    if (entity.linkedTo.length === 0) {
        return { flagged: false, linkedEntities: [], note: OWNERSHIP_NO_SIGNAL_NOTE };
    }
    return { flagged: true, linkedEntities: entity.linkedTo, note: OWNERSHIP_SIGNAL_NOTE };
}
