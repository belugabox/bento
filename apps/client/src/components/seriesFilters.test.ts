import { describe, expect, it } from 'vitest';

import {
    type ListedSeries,
    genresByCount,
    readingStateOf,
    seriesDetails,
    sortSeries,
} from './seriesFilters';

const series = (
    name: string,
    readCount: number,
    lastAddedAt: string | null,
    startedCount = readCount,
): ListedSeries => ({
    name,
    volumeCount: 3,
    readCount,
    startedCount,
    lastAddedAt,
});

const list = [
    series('Akira', 0, '2026-01-01T00:00:00.000Z'),
    series('Berserk', 3, '2026-03-01T00:00:00.000Z'),
    series('Coq de combat', 1, '2026-02-01T00:00:00.000Z'),
];

const names = (items: ListedSeries[]) => items.map((s) => s.name);

describe('readingStateOf', () => {
    it('tells unread, started and read series apart', () => {
        expect(list.map(readingStateOf)).toEqual(['unread', 'read', 'started']);
    });
});

describe('sortSeries', () => {
    it('sorts by name, without reading rank', () => {
        expect(names(sortSeries(list, 'name'))).toEqual([
            'Akira',
            'Berserk',
            'Coq de combat',
        ]);
    });

    it('ignores the articles when sorting by name', () => {
        expect(
            names(
                sortSeries(
                    [series('Les Vieux Fourneaux', 0, null), list[1]!],
                    'name',
                ),
            ),
        ).toEqual(['Berserk', 'Les Vieux Fourneaux']);
    });

    it('sorts by the last added volume, most recent first', () => {
        expect(names(sortSeries(list, 'recent'))).toEqual([
            'Berserk',
            'Coq de combat',
            'Akira',
        ]);
    });

    it('sorts by the last reading, never read last', () => {
        const read = [
            { ...list[0]!, lastReadAt: null },
            { ...list[1]!, lastReadAt: 100 },
            { ...list[2]!, lastReadAt: 300 },
        ];
        expect(names(sortSeries(read, 'lastRead'))).toEqual([
            'Coq de combat',
            'Berserk',
            'Akira',
        ]);
    });

    it('sorts by release year, the latest first, unknown last', () => {
        const dated = [
            { ...list[0]!, year: 1982 },
            { ...list[1]!, year: null },
            { ...list[2]!, year: 1999 },
        ];
        expect(names(sortSeries(dated, 'year'))).toEqual([
            'Coq de combat',
            'Akira',
            'Berserk',
        ]);
    });

    it('does not modify the given list', () => {
        const copy = [...list];
        sortSeries(list, 'recent');
        expect(list).toEqual(copy);
    });
});

describe('started series', () => {
    it('counts a series as started as soon as a volume is opened', () => {
        expect(readingStateOf(series('Dune', 0, null, 1))).toBe('started');
        expect(readingStateOf(series('Dune', 0, null, 0))).toBe('unread');
        expect(readingStateOf(series('Dune', 3, null, 3))).toBe('read');
    });
});

describe('genresByCount', () => {
    const items: ListedSeries[] = [
        {
            ...series('Akira', 0, null),
            genres: ['Science-fiction', 'Action'],
            format: 'manga',
            status: 'completed',
        },
        {
            ...series('Berserk', 0, null),
            genres: ['Fantasy', 'Action'],
            format: 'manga',
            status: 'ongoing',
            toRead: true,
        },
        {
            ...series('Solo Leveling', 0, null),
            genres: [],
            format: 'manhwa',
            status: null,
        },
    ];
    it('lists the genres once each, the most frequent first', () => {
        expect(genresByCount(items)).toEqual([
            { name: 'Action', count: 2 },
            { name: 'Fantasy', count: 1 },
            { name: 'Science-fiction', count: 1 },
        ]);
    });
});

describe('seriesDetails', () => {
    it('gives format, year, age and status, then the genres', () => {
        expect(
            seriesDetails({
                ...series('Akira', 0, null),
                format: 'Manga',
                year: 1984,
                age: 14,
                status: 'completed',
                genres: ['Action', 'Science-fiction'],
            }),
        ).toEqual(['Manga · 1984 · 14+ · Terminée', 'Action, Science-fiction']);
        expect(seriesDetails(series('Akira', 0, null))).toEqual([]);
    });

    it('starts with the author and the artist, once each', () => {
        expect(
            seriesDetails({
                ...series('Death Note', 0, null),
                writer: 'Tsugumi Ohba',
                penciller: 'Takeshi Obata',
            }),
        ).toEqual(['Tsugumi Ohba · Takeshi Obata']);
        expect(
            seriesDetails({
                ...series('Akira', 0, null),
                writer: 'Katsuhiro Otomo',
                penciller: 'katsuhiro otomo',
            }),
        ).toEqual(['Katsuhiro Otomo']);
    });
});

describe('sort by rating', () => {
    it('puts the best rated first, the unrated last', () => {
        const series = [
            { name: 'A', rating: 3.9 },
            { name: 'B', rating: null },
            { name: 'C', rating: 4.6 },
            { name: 'D', rating: 4.1, toRead: true },
            { name: 'E', rating: 4.1, ratingCount: 300 },
        ].map((s) => ({
            ...s,
            volumeCount: 2,
            readCount: 0,
            startedCount: 0,
            lastAddedAt: null,
        }));
        expect(sortSeries(series, 'rating').map((s) => s.name)).toEqual([
            'C',
            'E',
            'D',
            'A',
            'B',
        ]);
    });
});

describe('list details', () => {
    it('show the readers rating', () => {
        expect(
            seriesDetails({
                name: 'Gantz',
                volumeCount: 37,
                readCount: 0,
                startedCount: 0,
                lastAddedAt: null,
                format: 'Manga',
                status: 'completed',
                rating: 4.4,
            }),
        ).toEqual(['Manga · Terminée · ★ 4,4']);
    });
});
