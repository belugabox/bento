import { describe, expect, it } from 'vitest';

import {
    type EditableVolume,
    changesOf,
    fillFromFileNames,
    fillFromSheet,
    fillFromWikipedia,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    joinSeries,
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

describe('joinSeries', () => {
    it('takes the name and series fields of a published series', () => {
        const edits = joinSeries(
            setSeriesField(initialEdits(volumes), 'Genre', 'Comédie'),
            'SPY×FAMILY',
            { Series: 'Spy', Writer: 'Tatsuya Endō', Genre: '', Number: '3' },
        );

        expect(edits[second]).toEqual({
            Series: 'SPY×FAMILY',
            Writer: 'Tatsuya Endō',
            // Champ vide dans la série : la saisie est gardée.
            Genre: 'Comédie',
        });
        // Le numéro de chaque tome ne change pas.
        expect(edits[first]?.Number).toBe('1');
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

    it('puts back an article written after the series name', () => {
        const boxer: EditableVolume[] = [
            {
                path: '_draft/Boxer (The)/Boxer (The) #01 (2022).cbz',
                name: 'Boxer (The) #01 (2022).cbz',
                comicInfo: {},
            },
        ];
        const edits = fillFromFileNames(initialEdits(boxer), boxer, false);
        expect(edits[boxer[0]!.path]?.Series).toBe('The Boxer');
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

describe('fillFromSheet with the genre list', () => {
    const catalog = [
        { id: 1, name: 'Aventure', aliases: [] },
        { id: 2, name: 'Fantastique', aliases: [] },
    ];
    const sheet = {
        title: 'Dr. Stone',
        genre: 'Aventure, Fantastique',
        tags: 'survie',
    };
    const withGenre = (genre: string, tags?: string) =>
        Object.fromEntries(
            paths.map((path) => [path, { Genre: genre, Tags: tags }]),
        );

    it('fills genres hidden by a raw word that is a theme or an age', () => {
        const edits = fillFromSheet(
            withGenre('Shonen, Teen'),
            paths,
            sheet,
            false,
            catalog,
        );
        // « Shonen » est un thème déjà là, gardé ; « Teen » disparaît.
        expect(edits[second]).toMatchObject({
            Genre: 'Aventure, Fantastique',
            Tags: 'Shonen',
        });
    });

    it('keeps genres already chosen, and leaves the fields untouched', () => {
        const before = withGenre('Fantastique', 'robots');
        const edits = fillFromSheet(before, paths, sheet, false, catalog);
        expect(edits[first]?.Genre).toBe('Fantastique');
        expect(edits[first]?.Tags).toBe('robots');
    });

    it('replaces genres and themes when asked', () => {
        const edits = fillFromSheet(
            withGenre('Fantastique', 'robots'),
            paths,
            sheet,
            true,
            catalog,
        );
        expect(edits[first]).toMatchObject({
            Genre: 'Aventure, Fantastique',
            Tags: 'survie',
        });
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
