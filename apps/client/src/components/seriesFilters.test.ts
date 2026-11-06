import { describe, expect, it } from 'vitest';

import {
    type ListedSeries,
    allAudiences,
    allFormats,
    allGenres,
    filterSeries,
    readingStateOf,
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

describe('filterSeries', () => {
    it('keeps the server order by name, and filters by reading state', () => {
        expect(
            names(filterSeries(list, { filter: 'all', sort: 'name' })),
        ).toEqual(['Akira', 'Berserk', 'Coq de combat']);
        expect(
            names(filterSeries(list, { filter: 'started', sort: 'name' })),
        ).toEqual(['Coq de combat']);
    });

    it('sorts by the last added volume, most recent first', () => {
        expect(
            names(filterSeries(list, { filter: 'all', sort: 'recent' })),
        ).toEqual(['Berserk', 'Coq de combat', 'Akira']);
    });

    it('does not modify the given list', () => {
        const copy = [...list];
        filterSeries(list, { filter: 'all', sort: 'recent' });
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

describe('list, format, audience, genre and status filters', () => {
    const items: ListedSeries[] = [
        {
            ...series('Akira', 0, null),
            genres: ['Science-fiction', 'Action'],
            format: 'manga',
            audience: 'seinen',
            status: 'completed',
            collectionIds: [4],
        },
        {
            ...series('Berserk', 0, null),
            genres: ['Fantasy', 'Action'],
            format: 'manga',
            audience: null,
            status: 'ongoing',
            toRead: true,
        },
        {
            ...series('Solo Leveling', 0, null),
            genres: [],
            format: 'manhwa',
            audience: 'shonen',
            status: null,
        },
    ];
    const kept = (options: Partial<Parameters<typeof filterSeries>[1]>) =>
        names(filterSeries(items, { filter: 'all', sort: 'name', ...options }));

    it('keeps the to-read list or a collection', () => {
        expect(kept({ filter: 'toread' })).toEqual(['Berserk']);
        expect(kept({ list: 'collection:4' })).toEqual(['Akira']);
        expect(kept({ list: 'collection:5' })).toEqual([]);
    });

    it('keeps a genre', () => {
        expect(kept({ genre: 'Action' })).toEqual(['Akira', 'Berserk']);
        expect(kept({ genre: 'Fantasy' })).toEqual(['Berserk']);
    });

    it('keeps a format or an audience', () => {
        expect(kept({ format: 'manhwa' })).toEqual(['Solo Leveling']);
        expect(kept({ audience: 'seinen' })).toEqual(['Akira']);
        expect(allFormats(items)).toEqual(['manga', 'manhwa']);
        expect(allAudiences(items)).toEqual(['seinen', 'shonen']);
    });

    it('keeps a status', () => {
        expect(kept({ status: 'ongoing' })).toEqual(['Berserk']);
        expect(kept({ status: 'completed' })).toEqual(['Akira']);
    });

    it('lists the genres once each', () => {
        expect(allGenres(items)).toEqual([
            'Action',
            'Fantasy',
            'Science-fiction',
        ]);
    });
});
