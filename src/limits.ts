import { z } from "zod";

// Per-call batch caps. Screening is priced per CALL on this surface, not per
// subject, so an uncapped array would let one $0.02 call do unbounded work — and
// this container is fixed at 512Mi with a 350MB heap cap (see Dockerfile), so a
// large batch is an OOM risk as well as a pricing hole. Bulk lists belong on the
// Apify actor, which charges per entity screened and runs at 4GB.
//
// screen_entity is the cheaper, higher-volume call, so it gets the tighter cap.
// monitor_changes is a periodic re-check of an established watchlist, so a larger
// batch is legitimate there.
export const MAX_SCREEN_SUBJECTS = 10;
export const MAX_MONITOR_SUBJECTS = 50;

export const APIFY_ACTOR_URL = "https://apify.com/apifmcpfactory/sanctions-screening";

// previousResults is caller-supplied data compared against, not screening work, so
// it is not a pricing hole — but it is an unbounded allocation on a 350MB heap, and
// a monitor call can never meaningfully carry more prior results than it has
// subjects. Capped at the same limit for that reason.
export const MAX_PREVIOUS_RESULTS = MAX_MONITOR_SUBJECTS;

export function tooManyPreviousResults(limit: number): string {
    return (
        `Too many previousResults: pass at most ${limit}, matching this tool's subject ` +
        `limit. Send back only the "results" entries for the subjects in this call.`
    );
}

export function tooManySubjects(limit: number): string {
    return (
        `Too many subjects: this tool screens up to ${limit} per call. Split the list into ` +
        `batches of ${limit} or fewer, or run the whole list on the Apify actor, which is ` +
        `built for bulk screening and charges per entity screened: ${APIFY_ACTOR_URL}`
    );
}

/**
 * Wraps a subject item schema in the standard capped array: at least one subject,
 * at most `limit`, with a message that tells the caller exactly what to do next.
 * Both screen_entity and monitor_changes build their `subjects` input through this,
 * so the cap and the wording can only ever be changed in one place.
 */
export function cappedSubjectsSchema<T extends z.ZodTypeAny>(itemSchema: T, limit: number) {
    return z.array(itemSchema).min(1).max(limit, tooManySubjects(limit));
}

/** The prior-result set monitor_changes diffs against, bounded to the same limit. */
export function cappedPreviousResultsSchema(limit: number) {
    return z.array(z.unknown()).max(limit, tooManyPreviousResults(limit));
}
