import { describe, expect, it } from 'vitest';

import { parseSubjectsInput } from '../../src/core/parseSubjects.js';

describe('parseSubjectsInput', () => {
    it('accepts a plain array of strings', async () => {
        const subjects = await parseSubjectsInput({ subjects: ['John Smith', 'Jane Doe'] });
        expect(subjects).toEqual([{ name: 'John Smith' }, { name: 'Jane Doe' }]);
    });

    it('accepts a mixed array of strings and structured objects', async () => {
        const subjects = await parseSubjectsInput({
            subjects: ['Plain Name', { name: 'Structured', country: 'Cuba', yearOfBirth: 1980 }],
        });
        expect(subjects).toEqual([{ name: 'Plain Name' }, { name: 'Structured', country: 'Cuba', yearOfBirth: 1980 }]);
    });

    it('treats free text as one name per line', async () => {
        const subjects = await parseSubjectsInput({ subjectsText: 'John Smith\nJane Doe\n\n' });
        expect(subjects).toEqual([{ name: 'John Smith' }, { name: 'Jane Doe' }]);
    });

    it('detects and parses a CSV block with a header row', async () => {
        const subjects = await parseSubjectsInput({
            subjectsText: 'name,country,yearOfBirth\nJohn Smith,Cuba,1980\nJane Doe,Iran,1975',
        });
        expect(subjects).toEqual([
            { name: 'John Smith', country: 'Cuba', yearOfBirth: 1980 },
            { name: 'Jane Doe', country: 'Iran', yearOfBirth: 1975 },
        ]);
    });

    it('merges subjects from multiple input shapes given at once', async () => {
        const subjects = await parseSubjectsInput({ subjects: ['From Array'], subjectsText: 'From Text' });
        expect(subjects.map((s) => s.name)).toEqual(['From Array', 'From Text']);
    });
});
