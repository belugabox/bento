import { describe, expect, it } from 'vitest';

import {
    NO_FILTERS,
    activeFilters,
    filterCount,
    libraryLink,
    matchesFilters,
    readFilters,
    toggle,
    writeFilters,
} from './libraryFilters';
import type { ListedSeries } from './seriesFilters';

const base = {
    volumeCount: 3,
    readCount: 0,
    startedCount: 0,
    lastAddedAt: null,
};
const SERIES: (ListedSeries & { id: number })[] = [
    {
        ...base,
        id: 1,
        name: 'Akira',
        genres: ['Science-fiction', 'Action'],
        format: 'Manga',
        status: 'completed',
    },
    {
        ...base,
        id: 2,
        name: 'Berserk',
        genres: ['Fantasy', 'Action'],
        format: 'Manga',
        status: 'ongoing',
        toRead: true,
        readCount: 1,
        startedCount: 2,
    },
    {
        ...base,
        id: 3,
        name: 'Blacksad',
        genres: ['Polar'],
        format: 'BD',
        status: null,
        readCount: 3,
        startedCount: 3,
        newCount: 2,
    },
];

const kept = (
    filters: Partial<typeof NO_FILTERS>,
    context?: Parameters<typeof matchesFilters>[2],
) =>
    SERIES.filter((s) =>
        matchesFilters(s, { ...NO_FILTERS, ...filters }, context),
    ).map((s) => s.name);

describe('library filters', () => {
    it('keeps everything without a filter', () => {
        expect(kept({})).toEqual(['Akira', 'Berserk', 'Blacksad']);
    });

    it('keeps any of the chosen values of a filter', () => {
        expect(kept({ genres: ['Polar', 'Fantasy'] })).toEqual([
            'Berserk',
            'Blacksad',
        ]);
        expect(kept({ formats: ['BD'] })).toEqual(['Blacksad']);
        expect(kept({ release: ['ongoing'] })).toEqual(['Berserk']);
    });

    it('adds up the filters', () => {
        expect(kept({ genres: ['Action'], release: ['completed'] })).toEqual([
            'Akira',
        ]);
    });

    it('filters by reading state, the to-read list and new volumes', () => {
        expect(kept({ reading: ['unread'] })).toEqual(['Akira']);
        expect(kept({ reading: ['started'] })).toEqual(['Berserk']);
        expect(kept({ reading: ['read'] })).toEqual(['Blacksad']);
        expect(kept({ reading: ['notforme'] })).toEqual([]);
        expect(kept({ reading: ['toread', 'new'] })).toEqual([
            'Berserk',
            'Blacksad',
        ]);
    });

    it('filters by family reader and by what is on this device', () => {
        const readers = [
            { id: 7, seriesIds: [1] },
            { id: 8, seriesIds: [3] },
        ];
        expect(kept({ readers: [7] }, { readers })).toEqual(['Akira']);
        expect(kept({ readers: [7, 8] }, { readers })).toEqual([
            'Akira',
            'Blacksad',
        ]);
        expect(
            kept({ downloaded: true }, { downloaded: new Set([2]) }),
        ).toEqual(['Berserk']);
    });
});

describe('filters in the address', () => {
    it('reads and writes several values, keeping the other parameters', () => {
        const filters = {
            ...NO_FILTERS,
            reading: ['toread' as const],
            genres: ['Action', 'Drame, social'],
            readers: [4],
            downloaded: true,
        };
        const params = writeFilters(
            new URLSearchParams('sort=recent&genre=Old'),
            filters,
        );
        expect(params.get('sort')).toBe('recent');
        expect(readFilters(params)).toEqual(filters);
        expect(filterCount(filters)).toBe(5);
    });

    it('ignores unknown values', () => {
        expect(
            readFilters(new URLSearchParams('reading=nope&status=x&reader=a')),
        ).toEqual(NO_FILTERS);
    });

    it('builds a library link', () => {
        expect(libraryLink({ reading: ['toread'] })).toBe(
            '/library?reading=toread',
        );
        expect(libraryLink({}, { sort: 'recent' })).toBe(
            '/library?sort=recent',
        );
        expect(libraryLink({})).toBe('/library');
    });
});

describe('activeFilters', () => {
    it('names each chosen filter, and the filters without it', () => {
        const filters = {
            ...NO_FILTERS,
            reading: ['new' as const],
            genres: ['Action'],
            readers: [7],
        };
        const chips = activeFilters(filters, [{ id: 7, name: 'Lou' }]);
        expect(chips.map((c) => c.label)).toEqual([
            'Nouveaux tomes',
            'Action',
            'Lu par Lou',
        ]);
        expect(chips[1]!.without).toEqual({ ...filters, genres: [] });
    });

    it('toggles a value', () => {
        expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
        expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
    });
});
