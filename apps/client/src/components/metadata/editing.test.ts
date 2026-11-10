import { describe, expect, it } from 'vitest';

import { DEFAULT_SOURCE_PRIORITY } from '@server/types';

import {
    type EditableVolume,
    applySheetValues,
    changesOf,
    chosenValues,
    comparisonRows,
    defaultChoice,
    editedValues,
    fillFromFileNames,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    joinSeries,
    searchNameOf,
    seriesValue,
    setSeriesField,
    setVolumeKind,
    sheetFromWikipedia,
    sheetValues,
    statusFromWikipedia,
    volumeKindOf,
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

describe('searchNameOf', () => {
    it('uses the series, else a file name, else the folder', () => {
        expect(searchNameOf(' Gantz ', volumes)).toBe('Gantz');
        // Article à la fin (nom rangé) : remis devant.
        expect(searchNameOf('Sculpteur (le)', volumes)).toBe('Le Sculpteur');
        expect(searchNameOf('', volumes)).toBe('Spy x Family');
        const numbered = [
            { path: '_draft/Dr Stone/01.cbz', name: '01.cbz' },
            { path: '_draft/02.cbz', name: '02.cbz' },
        ];
        expect(searchNameOf('', numbered)).toBe('Dr Stone');
        expect(searchNameOf('', numbered.slice(1))).toBe('');
    });
});

describe('fillFromFileNames', () => {
    it('fills empty numbers, years and series', () => {
        const edits = fillFromFileNames(initialEdits(volumes), volumes, false);
        expect(edits[first]).toEqual({
            Series: 'Spy x Family',
            Number: '1',
            Year: 2020,
        });
        expect(edits[second]).toEqual({
            Series: 'Spy x Family',
            Number: '2',
            Year: 2020,
        });
    });

    it('reads hors-séries and specials (HS01, SP01)', () => {
        const specials: EditableVolume[] = [
            {
                path: '_draft/Gantz/Gantz HS01 (2010).cbz',
                name: 'Gantz HS01 (2010).cbz',
                comicInfo: {},
            },
            {
                path: '_draft/Gantz/Gantz SP02.cbz',
                name: 'Gantz SP02.cbz',
                // Ancienne écriture du numéro, préfixé.
                comicInfo: { Number: 'SP02' },
            },
        ];
        const edits = fillFromFileNames(
            initialEdits(specials),
            specials,
            false,
        );
        expect(edits[specials[0]!.path]).toEqual({
            Series: 'Gantz',
            Number: '1',
            Format: 'Hors-série',
            Year: 2010,
        });
        expect(edits[specials[1]!.path]).toMatchObject({
            Number: '2',
            Format: 'Spécial',
        });
        // Pas de titre par défaut : il est facultatif.
        expect(edits[specials[1]!.path]!.Title).toBeUndefined();
    });

    it('changes the kind of a volume in its Format field', () => {
        const edits = { [first]: { Number: 'HS01', Format: 'TPB' } };
        expect(volumeKindOf(edits[first])).toBe('hors-serie');
        const special = setVolumeKind(edits, first, 'special');
        expect(special[first]).toEqual({ Number: '1', Format: 'Spécial' });
        expect(setVolumeKind(special, first, 'volume')[first]).toEqual({
            Number: '1',
        });
        // One-shot : le numéro est vidé.
        expect(setVolumeKind(edits, first, 'one-shot')[first]).toEqual({
            Format: 'One-shot',
        });
        // Un autre Format n'est pas un type : gardé.
        expect(
            setVolumeKind({ [first]: { Format: 'TPB' } }, first, 'volume')[
                first
            ],
        ).toEqual({ Format: 'TPB' });
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
            Year: 2020,
        });
    });
});

describe('comparison with online sheets', () => {
    const catalog = [
        { id: 1, name: 'Aventure', aliases: [] },
        { id: 2, name: 'Fantastique', aliases: [] },
        { id: 3, name: 'Thriller', aliases: ['Suspense'] },
    ];
    const formats = [{ id: 1, name: 'Manga' }];

    it('reads a sheet as the editor keeps it', () => {
        expect(
            sheetValues(
                {
                    ...sheetFromWikipedia(wiki),
                    genre: 'Suspense, Shōnen',
                    format: 'manga',
                    age: 12,
                },
                catalog,
                formats,
            ),
        ).toEqual({
            Series: 'Spy × Family',
            Format: '1',
            Age: '12',
            Status: 'ongoing',
            Genre: 'Thriller',
            Tags: 'Shōnen',
            Writer: 'Tatsuya Endō',
            Penciller: 'Tatsuya Endō',
            Publisher: 'Kurokawa',
            Summary: 'Un espion.',
        });
    });

    it('reads the edited volumes, genres sorted as shown', () => {
        const edits = setSeriesField(
            initialEdits(volumes),
            'Genre',
            'Shonen, Teen',
        );
        // « Shonen » est un thème, « Teen » un âge : pas de genre.
        expect(editedValues(edits, paths, catalog)).toEqual({
            Series: 'Spy x Family',
            Tags: 'Shonen',
        });
    });

    it('lists only the fields a sheet changes, the current value first', () => {
        const rows = comparisonRows(
            { Series: 'Spy x Family', Tags: 'aliens' },
            [
                {
                    site: 'manga-news',
                    values: { Series: 'Spy x Family', Writer: 'Endō' },
                },
                {
                    site: 'wikipedia',
                    values: { Series: 'Spy × Family', Writer: 'Tatsuya Endō' },
                },
            ],
        );
        expect(rows).toEqual([
            {
                field: 'Series',
                current: 'Spy x Family',
                found: {
                    'manga-news': 'Spy x Family',
                    wikipedia: 'Spy × Family',
                },
            },
            {
                field: 'Writer',
                current: undefined,
                found: { 'manga-news': 'Endō', wikipedia: 'Tatsuya Endō' },
            },
        ]);
        const priority = {
            ...DEFAULT_SOURCE_PRIORITY,
            Writer: 'wikipedia' as const,
        };
        // Champ rempli : gardé ; vide : le site préféré pour ce champ.
        expect(rows.map((row) => defaultChoice(row, priority))).toEqual([
            'current',
            'wikipedia',
        ]);
        // Le site préféré sans valeur : l'autre.
        expect(
            defaultChoice(
                { field: 'Writer', found: { 'manga-news': 'Endō' } },
                priority,
            ),
        ).toBe('manga-news');
        expect(
            chosenValues(rows, { Series: 'current', Writer: 'wikipedia' }),
        ).toEqual({ Writer: 'Tatsuya Endō' });
    });

    it('applies the chosen values, keeping themes from the files', () => {
        const edits = applySheetValues(
            setSeriesField(initialEdits(volumes), 'Genre', 'Shonen'),
            paths,
            {
                Genre: 'Aventure, Fantastique',
                Writer: 'Endō',
                Summary: 'Un espion.',
            },
            catalog,
        );
        expect(edits[second]).toEqual({
            Genre: 'Aventure, Fantastique',
            Tags: 'Shonen',
            Writer: 'Endō',
        });
        expect(edits[first]?.Summary).toBe('Un espion.');
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
