import { describe, expect, it } from 'vitest';

import { DEFAULT_SOURCE_PRIORITY } from '@server/types';

import {
    type EditableVolume,
    type Edits,
    applySheetValues,
    changesOf,
    chosenValues,
    comparisonRows,
    defaultChoice,
    distinctNames,
    editedValues,
    fillFromFileNames,
    fillFromSheetVolumes,
    initialEdits,
    isFieldChanged,
    isMixed,
    isSeriesFieldChanged,
    joinSeries,
    rowOptions,
    searchNameOf,
    seriesValue,
    setSeriesField,
    setVolumeKind,
    sharedTargets,
    sheetFromBedetheque,
    sheetFromMangaNews,
    sheetFromWikipedia,
    sheetValues,
    statusFromWikipedia,
    targetLabel,
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

    it('keeps names that differ only by punctuation apart', () => {
        const rows = comparisonRows({ Series: 'Gantz G' }, [
            { site: 'manga-news', values: { Series: 'Gantz G' } },
            { site: 'bedetheque', values: { Series: 'Gantz:G' } },
        ]);
        expect(rows).toHaveLength(1);
        expect(
            rowOptions(rows[0]!, ['manga-news', 'wikipedia', 'bedetheque']).map(
                (option) => [option.value, option.sources],
            ),
        ).toEqual([
            ['Gantz G', ['current', 'manga-news']],
            ['Gantz:G', ['bedetheque']],
        ]);
    });

    it('shows each different value once, with who gives it', () => {
        const rows = comparisonRows(
            { Publisher: 'Casterman', Tags: 'Roman graphique' },
            [
                {
                    site: 'wikipedia',
                    values: {
                        Publisher: 'Pantheon Books',
                        Tags: 'Roman Graphique',
                    },
                },
                {
                    site: 'bedetheque',
                    values: {
                        Publisher: 'casterman',
                        Tags: 'Roman graphique',
                    },
                },
            ],
        );
        // Thèmes : seule une majuscule change, pas de ligne.
        expect(rows.map((row) => row.field)).toEqual(['Publisher']);
        expect(
            rowOptions(rows[0]!, ['manga-news', 'wikipedia', 'bedetheque']),
        ).toEqual([
            {
                choice: 'current',
                value: 'Casterman',
                sources: ['current', 'bedetheque'],
            },
            {
                choice: 'wikipedia',
                value: 'Pantheon Books',
                sources: ['wikipedia'],
            },
        ]);
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

describe('sheetFromBedetheque', () => {
    it('takes the format from the origin, and a one shot is finished', () => {
        expect(
            sheetFromBedetheque({
                title: 'Asterios Polyp',
                summary: 'Un architecte…',
                genres: ['Roman graphique'],
                origin: 'Comics',
                writer: 'David Mazzucchelli',
                penciller: 'David Mazzucchelli',
                publisher: 'Casterman',
                ongoing: false,
            }),
        ).toMatchObject({
            genre: 'Roman graphique',
            format: 'Comics',
            status: 'completed',
            publisher: 'Casterman',
        });
        const blacksad = {
            title: 'Blacksad',
            summary: '',
            genres: ['Policier'],
            origin: 'Franco-Belge',
            writer: '',
            penciller: '',
            publisher: 'Dargaud',
            ongoing: true,
        };
        expect(sheetFromBedetheque(blacksad)).toMatchObject({
            format: 'BD',
            status: 'ongoing',
        });
    });
});

describe('period from the online sheets', () => {
    const base = {
        title: 'X',
        summary: '',
        writer: '',
        penciller: '',
        publisher: '',
    };
    const period = (sheet: Parameters<typeof sheetValues>[0]) =>
        sheetValues(sheet, [], []).Period;

    it('takes the original edition: first and last volume, or the start only', () => {
        // Wikipédia : premier et dernier volume.
        expect(
            period(
                sheetFromWikipedia({
                    ...base,
                    genre: '',
                    ongoing: false,
                    firstYear: 2000,
                    lastYear: 2013,
                }),
            ),
        ).toBe('2000 – 2013');
        // Manga-news : l'année d'origine seule.
        expect(
            period(
                sheetFromMangaNews({
                    ...base,
                    genres: [],
                    themes: [],
                    format: 'Manga',
                    year: 2019,
                }),
            ),
        ).toBe('2019');
    });

    it('takes the Bedetheque years for a BD, not for a manga (French edition)', () => {
        const bedetheque = {
            ...base,
            genres: [],
            firstYear: 2004,
            lastYear: 2010,
        };
        expect(
            period(
                sheetFromBedetheque({ ...bedetheque, origin: 'Franco-Belge' }),
            ),
        ).toBe('2004 – 2010');
        expect(
            period(sheetFromBedetheque({ ...bedetheque, origin: 'Manga' })),
        ).toBeUndefined();
    });
});

describe('rating from the online sheets', () => {
    it('stays out of the fields and of the ComicInfo', () => {
        const values = sheetValues(
            sheetFromMangaNews({
                title: 'Spy x Family',
                summary: '',
                genres: [],
                themes: [],
                writer: '',
                penciller: '',
                publisher: '',
                format: null,
                rating: { value: 4.4, count: 96 },
            }),
            [],
            [],
        );
        expect(values).toEqual({ Series: 'Spy x Family' });
    });
});

describe('fillFromSheetVolumes', () => {
    const paths = ['T01.cbz', 'T02.cbz', 'HS01.cbz', 'T03.cbz'].map((path) => ({
        path,
    }));
    const edits: Edits = {
        'T01.cbz': { Series: 'Blacksad', Number: '1' },
        // Déjà rempli : gardé.
        'T02.cbz': { Series: 'Blacksad', Number: '2', Title: 'Mon titre' },
        'HS01.cbz': { Series: 'Blacksad', Number: '1', Format: 'Hors-série' },
        'T03.cbz': { Series: 'Blacksad', Number: '3' },
    };

    it('fills the empty titles and years, matching kind and number', () => {
        const { edits: next, filled } = fillFromSheetVolumes(edits, paths, [
            [
                {
                    kind: 'volume',
                    number: 1,
                    title: 'Quelque part',
                    year: 2000,
                },
                {
                    kind: 'volume',
                    number: 2,
                    title: 'Arctic-Nation',
                    year: 2003,
                },
                {
                    kind: 'hors-serie',
                    number: 1,
                    title: 'Aquarelles',
                    year: 2005,
                },
            ],
            // Wikipédia : l'année seule, après Bedetheque.
            [
                { kind: 'volume', number: 1, year: 1999 },
                { kind: 'volume', number: 3, year: 2005 },
            ],
        ]);
        expect(next['T01.cbz']).toMatchObject({
            Title: 'Quelque part',
            Year: 2000,
        });
        expect(next['T02.cbz']).toMatchObject({
            Title: 'Mon titre',
            Year: 2003,
        });
        expect(next['HS01.cbz']).toMatchObject({
            Title: 'Aquarelles',
            Year: 2005,
        });
        expect(next['T03.cbz']).toMatchObject({ Year: 2005 });
        expect(next['T03.cbz']?.Title).toBeUndefined();
        expect(filled).toBe(6);
    });

    it('matches a one-shot with the one of the sheet', () => {
        expect(
            fillFromSheetVolumes(
                { 'A.cbz': { Series: 'Asterios Polyp', Format: 'One-shot' } },
                [{ path: 'A.cbz' }],
                [
                    [
                        {
                            kind: 'one-shot',
                            number: null,
                            title: 'Asterios Polyp',
                            year: 2010,
                        },
                    ],
                ],
            ).edits['A.cbz'],
        ).toMatchObject({ Title: 'Asterios Polyp', Year: 2010 });
    });
});

describe('groups of volumes', () => {
    const NAMES = [
        'Pokémon - La Grande Aventure (Part 1) - Rouge, Bleu et Jaune T01 (Kusaka-Mato) (2014) [Digital-1085] [Manga FR] (PapriKa+).cbz',
        'Pokémon - La Grande Aventure (Part 1) - Rouge, Bleu et Jaune T02 (Kusaka-Mato) (2014) [Digital-1920] [Manga FR] (PapriKa+).cbz',
        'Pokémon - La Grande Aventure (Part 4b) - Emeraude T03 (Kusaka-Yamamoto) (2017) [Digital-1920] [Manga FR] (PapriKa+).cbz',
    ];
    const volumes = NAMES.map((name, i) => ({
        path: `_draft/P/${i}.cbz`,
        name,
        comicInfo: {},
    }));
    const paths = volumes.map((v) => v.path);

    it('fills the group from the file names, as written', () => {
        const edits = fillFromFileNames({}, volumes, false);
        expect(edits[paths[0]!]).toMatchObject({
            Series: 'Pokémon - La Grande Aventure',
            StoryArc: 'Part 1 - Rouge, Bleu et Jaune',
            Number: '1',
        });
        expect(edits[paths[2]!]).toMatchObject({
            StoryArc: 'Part 4b - Emeraude',
            Number: '3',
        });
    });

    it('finds the volumes that would land on the same file', () => {
        expect([
            ...sharedTargets(['a.cbz', 'b.cbz', 'a.cbz', null, null]),
        ]).toEqual(['a.cbz']);
        expect(sharedTargets(['a.cbz', 'b.cbz']).size).toBe(0);
    });
});

describe('distinctNames', () => {
    it('keeps what tells the files apart, the part whole, without tags', () => {
        expect(
            distinctNames([
                'Pokémon - La Grande Aventure (Part 1) - Rouge, Bleu et Jaune T01 (Kusaka-Mato) (2014) [Digital-1085] [Manga FR] (PapriKa+).cbz',
                'Pokémon - La Grande Aventure (Part 4b) - Emeraude T03 (Kusaka-Yamamoto) (2017) [Digital-1920] [Manga FR] (PapriKa+).cbz',
            ]),
        ).toEqual([
            '(Part 1) - Rouge, Bleu et Jaune T01 (Kusaka-Mato) (2014)',
            '(Part 4b) - Emeraude T03 (Kusaka-Yamamoto) (2017)',
        ]);
    });

    it('keeps the whole name of a file alone, without its tags', () => {
        expect(distinctNames(['Spirale [Digital-1920].cbz'])).toEqual([
            'Spirale',
        ]);
        // Noms identiques à la casse près : rien de vide.
        expect(distinctNames(['Gantz.cbz', 'Gantz.cbz'])).toEqual([
            'Gantz',
            'Gantz',
        ]);
    });
});

describe('targetLabel', () => {
    it('keeps the future file name without what the series says', () => {
        expect(
            targetLabel(
                'Pokémon - La Grande Aventure/Pokémon - La Grande Aventure - Part 1 #01 (2014).cbz',
            ),
        ).toBe('Part 1 #01 (2014)');
        expect(targetLabel('Gantz/Gantz HS01.cbz')).toBe('HS01');
        expect(targetLabel('Spirale/Spirale (2021).cbz')).toBe('(2021)');
    });
});
