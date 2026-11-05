import { describe, expect, it } from 'vitest';

import {
    type EditableVolume,
    changesOf,
    fillFromFileNames,
    fillFromWikipedia,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    seriesValue,
    setSeriesField,
    statusFromWikipedia,
} from './editing';

const volumes: EditableVolume[] = [
    {
        path: '_draft/Spy x Family T01 (2020).cbz',
        name: 'Spy x Family T01 (2020).cbz',
        comicInfo: { Series: 'Spy x Family', Number: '1' },
    },
    {
        path: '_draft/Spy x Family T02 (2020).cbz',
        name: 'Spy x Family T02 (2020).cbz',
        comicInfo: {},
    },
];
const paths = volumes.map((v) => v.path);
const [first, second] = paths as [string, string];

const wiki = {
    title: 'Spy × Family',
    summary: 'Un espion.',
    genre: 'Action',
    writer: 'Tatsuya Endō',
    penciller: 'Tatsuya Endō',
    publisher: 'Kurokawa',
    ongoing: true,
};

describe('series fields', () => {
    it('reads the first value and spots differences', () => {
        const edits = initialEdits(volumes);
        expect(seriesValue(edits, paths, 'Series')).toBe('Spy x Family');
        expect(isMixed(edits, paths, 'Series')).toBe(true);
    });

    it('applies a value to every volume, or removes it', () => {
        let edits = setSeriesField(initialEdits(volumes), 'Genre', 'Comédie');
        expect(edits[second]).toEqual({ Genre: 'Comédie' });
        expect(isMixed(edits, paths, 'Genre')).toBe(false);

        edits = setSeriesField(edits, 'Genre', '');
        expect(edits[first]).toEqual({ Series: 'Spy x Family', Number: '1' });
    });
});

describe('fillFromFileNames', () => {
    it('fills empty numbers, years and series', () => {
        const edits = fillFromFileNames(initialEdits(volumes), volumes, false);
        expect(edits[first]).toEqual({
            Series: 'Spy x Family',
            Number: '1',
            Title: 'Tome 1',
            Year: 2020,
        });
        expect(edits[second]).toEqual({
            Series: 'Spy x Family',
            Number: '2',
            Title: 'Tome 2',
            Year: 2020,
        });
    });

    it('replaces numbers and years when asked, never the series', () => {
        const edits = fillFromFileNames(
            {
                [first]: { Series: 'Mine', Number: '9' },
                [second]: {},
            },
            volumes,
            true,
        );
        expect(edits[first]).toEqual({
            Series: 'Mine',
            Number: '1',
            Title: 'Tome 1',
            Year: 2020,
        });
    });
});

describe('fillFromWikipedia', () => {
    it('fills empty series fields, and the summary of the first volume only', () => {
        const edits = fillFromWikipedia(
            initialEdits(volumes),
            paths,
            wiki,
            false,
        );
        expect(edits[first]).toEqual({
            Series: 'Spy x Family',
            Number: '1',
            Genre: 'Action',
            Writer: 'Tatsuya Endō',
            Penciller: 'Tatsuya Endō',
            Publisher: 'Kurokawa',
            Summary: 'Un espion.',
        });
        expect(edits[second]?.Series).toBe('Spy × Family');
        expect(edits[second]?.Summary).toBeUndefined();
    });

    it('replaces existing values when asked', () => {
        const edits = fillFromWikipedia(
            initialEdits(volumes),
            paths,
            wiki,
            true,
        );
        expect(edits[first]?.Series).toBe('Spy × Family');
    });
});

describe('changesOf', () => {
    it('keeps only changed fields, null for removed ones', () => {
        expect(
            changesOf(
                { Series: 'A', Number: '1', Year: 2020 },
                { Series: 'B', Number: '1', Writer: 'X' },
            ),
        ).toEqual({ Series: 'B', Year: null, Writer: 'X' });
        expect(changesOf({ Count: 3 }, { Count: 3 })).toEqual({});
    });
});

describe('changed fields', () => {
    it('spots fields that differ from what is saved', () => {
        const original = initialEdits(volumes);
        const edits = fillFromFileNames(original, volumes, false);

        expect(isFieldChanged(original, edits, first, 'Year')).toBe(true);
        expect(isFieldChanged(original, edits, first, 'Number')).toBe(false);
        expect(isSeriesFieldChanged(original, edits, paths, 'Series')).toBe(
            true,
        );
        expect(isSeriesFieldChanged(original, edits, paths, 'Genre')).toBe(
            false,
        );
    });
});

describe('statusFromWikipedia', () => {
    it('reads finished and ongoing series', () => {
        expect(statusFromWikipedia({ ongoing: false, lastYear: 2021 })).toBe(
            'completed',
        );
        expect(statusFromWikipedia({ ongoing: true })).toBe('ongoing');
        expect(statusFromWikipedia({ ongoing: false })).toBeUndefined();
    });
});
