import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
    APIFY_ACTOR_URL,
    MAX_MONITOR_SUBJECTS,
    MAX_PREVIOUS_RESULTS,
    MAX_SCREEN_SUBJECTS,
    cappedPreviousResultsSchema,
    cappedSubjectsSchema,
    tooManyPreviousResults,
    tooManySubjects,
} from "../../src/limits.js";

// The same item schema shape both live tools use: a plain name string is always
// a valid subject, so a string array exercises the real cap path in index.ts.
const subjects = (n: number) => Array.from({ length: n }, (_, i) => `Subject ${i + 1}`);

describe("per-call batch caps", () => {
    it("pins the agreed limits so a change is a deliberate edit, not a drift", () => {
        expect(MAX_SCREEN_SUBJECTS).toBe(10);
        expect(MAX_MONITOR_SUBJECTS).toBe(50);
    });

    describe("screen_entity (cap 10)", () => {
        const schema = cappedSubjectsSchema(z.string(), MAX_SCREEN_SUBJECTS);

        it("accepts a single subject", () => {
            expect(schema.safeParse(subjects(1)).success).toBe(true);
        });

        it("accepts exactly the cap", () => {
            expect(schema.safeParse(subjects(MAX_SCREEN_SUBJECTS)).success).toBe(true);
        });

        it("rejects one over the cap", () => {
            expect(schema.safeParse(subjects(MAX_SCREEN_SUBJECTS + 1)).success).toBe(false);
        });

        it("rejects an empty array", () => {
            expect(schema.safeParse([]).success).toBe(false);
        });

        it("explains the limit and points oversized batches at the Apify actor", () => {
            const result = schema.safeParse(subjects(500));
            expect(result.success).toBe(false);
            const message = result.success ? "" : result.error.issues[0].message;
            expect(message).toContain("up to 10 per call");
            expect(message).toContain(APIFY_ACTOR_URL);
            expect(message).toContain("charges per entity screened");
        });
    });

    describe("monitor_changes (cap 50)", () => {
        const schema = cappedSubjectsSchema(z.string(), MAX_MONITOR_SUBJECTS);

        it("accepts exactly the cap", () => {
            expect(schema.safeParse(subjects(MAX_MONITOR_SUBJECTS)).success).toBe(true);
        });

        it("rejects one over the cap", () => {
            expect(schema.safeParse(subjects(MAX_MONITOR_SUBJECTS + 1)).success).toBe(false);
        });

        it("allows batches that screen_entity would reject", () => {
            expect(schema.safeParse(subjects(MAX_SCREEN_SUBJECTS + 1)).success).toBe(true);
        });
    });

    describe("monitor_changes previousResults (cap 50)", () => {
        const schema = cappedPreviousResultsSchema(MAX_PREVIOUS_RESULTS);

        it("tracks the monitor subject limit", () => {
            expect(MAX_PREVIOUS_RESULTS).toBe(MAX_MONITOR_SUBJECTS);
        });

        it("accepts an empty prior set (first run has no baseline)", () => {
            expect(schema.safeParse([]).success).toBe(true);
        });

        it("accepts exactly the cap", () => {
            expect(schema.safeParse(subjects(MAX_PREVIOUS_RESULTS)).success).toBe(true);
        });

        it("rejects one over the cap", () => {
            const result = schema.safeParse(subjects(MAX_PREVIOUS_RESULTS + 1));
            expect(result.success).toBe(false);
            const message = result.success ? "" : result.error.issues[0].message;
            expect(message).toContain("at most 50");
        });
    });

    describe("tooManySubjects message", () => {
        it("names the limit it was given", () => {
            expect(tooManySubjects(10)).toContain("up to 10 per call");
            expect(tooManySubjects(50)).toContain("up to 50 per call");
        });

        it("tells the caller how to proceed without support", () => {
            const message = tooManySubjects(10);
            expect(message).toContain("batches of 10 or fewer");
            expect(message).toContain("https://apify.com/apifmcpfactory/sanctions-screening");
        });
    });
});
