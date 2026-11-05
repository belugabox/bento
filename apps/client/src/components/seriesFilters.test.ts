import { describe, expect, it } from 'vitest';

import {
    type ListedSeries,
    filterSeries,
    readingStateOf,
} from './seriesFilters';

const series = (
    name: string,
    readCount: number,
    lastAddedAt: string | null,
): ListedSeries => ({ name, volumeCount: 3, readCount, lastAddedAt });

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
