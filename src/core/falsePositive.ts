// Compares a subject's own known attributes (DOB, country, identifiers)
// against a matched list entity's attributes and flags concrete mismatch
// signals - a name-only match against, say, a common surname is far less
// likely to be the same person if the subject's stated birth year or country
// contradicts the list entry's. This never overrides a name match itself
// (that stays the analyst's call); it only surfaces evidence for or against.

import type { FalsePositiveAnalysis, NormalizedEntity, Subject } from './types.js';

const AUTO_CLEAR_MAX_CONFIDENCE = 90;
const AUTO_CLEAR_MIN_MISMATCHES = 2;

export function analyzeFalsePositive(subject: Subject, entity: NormalizedEntity, confidence: number): FalsePositiveAnalysis {
    const mismatchSignals: string[] = [];

    const subjectYear = subject.yearOfBirth ?? (subject.dob ? Number(subject.dob.slice(0, 4)) || undefined : undefined);
    if (subjectYear && entity.dobYear && Math.abs(subjectYear - entity.dobYear) > 1) {
        mismatchSignals.push(`date of birth differs (subject: ${subjectYear}, list entry: ${entity.dobYear})`);
    }

    const subjectCountry = subject.country?.trim().toLowerCase();
    if (subjectCountry && entity.countries.length > 0) {
        const anyCountryMatches = entity.countries.some((c) => c.trim().toLowerCase() === subjectCountry);
        if (!anyCountryMatches) {
            mismatchSignals.push(`country differs (subject: ${subject.country}, list entry: ${entity.countries.join(', ')})`);
        }
    }

    const subjectNationality = subject.nationality?.trim().toLowerCase();
    if (subjectNationality && entity.nationalities.length > 0) {
        const anyNationalityMatches = entity.nationalities.some((n) => n.trim().toLowerCase() === subjectNationality);
        if (!anyNationalityMatches) {
            mismatchSignals.push(
                `nationality differs (subject: ${subject.nationality}, list entry: ${entity.nationalities.join(', ')})`,
            );
        }
    }

    const subjectIds = [subject.idNumber, subject.passport, subject.regNumber, subject.lei].filter(Boolean);
    if (subjectIds.length > 0 && entity.identifiers.length > 0) {
        const anyIdMatches = subjectIds.some((id) =>
            entity.identifiers.some((listId) => listId.toLowerCase().includes(String(id).toLowerCase())),
        );
        if (!anyIdMatches) {
            mismatchSignals.push('identifier provided but does not appear among the list entry\'s known identifiers');
        }
    }

    const likelyFalsePositive = confidence < AUTO_CLEAR_MAX_CONFIDENCE && mismatchSignals.length >= AUTO_CLEAR_MIN_MISMATCHES;
    const reason = likelyFalsePositive
        ? `Name similarity is below ${AUTO_CLEAR_MAX_CONFIDENCE} and ${mismatchSignals.length} attribute(s) contradict the list entry - likely a coincidental name match.`
        : mismatchSignals.length > 0
          ? 'Some attributes differ, but name similarity and/or the number of mismatches is not conclusive - review recommended.'
          : 'No contradicting attributes found; name match alone should not be dismissed without analyst review.';

    return { mismatchSignals, likelyFalsePositive, reason };
}

export function shouldAutoClear(analysis: FalsePositiveAnalysis): boolean {
    return analysis.likelyFalsePositive;
}
