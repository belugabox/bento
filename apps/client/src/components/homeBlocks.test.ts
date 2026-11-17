import { describe, expect, it } from 'vitest';

import type { SeriesSummary } from '@/services/api';

import { homeBlocks } from './homeBlocks';

const series = (
    id: number,
    extra: Partial<SeriesSummary> = {},
): SeriesSummary =>
    ({
        id,
        name: `Série ${id}`,
        volumeCount: 3,
        readCount: 0,
        startedCount: 0,
        lastAddedAt: `2026-01-0${id}T00:00:00.000Z`,
        newCount: 0,
        ...extra,
    }) as SeriesSummary;

const ids = (list: SeriesSummary[]) => list.map((s) => s.id);

describe('homeBlocks', () => {
    it('puts each series in the first block it belongs to, never twice', () => {
        const list = [
            // En cours : seulement dans le bloc « En cours ».
            series(1, { newCount: 2, toRead: true }),
            series(2, { newCount: 1, toRead: true, readCount: 1 }),
            series(3, { toRead: true }),
            // Lue : plus dans « À lire ».
            series(6, { toRead: true, readCount: 3, startedCount: 3 }),
            series(4),
            series(5),
        ];
        const blocks = homeBlocks(
            list,
            [{ seriesId: 1 }],
            [{ id: 7, seriesIds: [3, 4] }],
        );

        expect(ids(blocks.fresh)).toEqual([2]);
        expect(ids(blocks.toRead)).toEqual([3]);
        expect(ids(blocks.family)).toEqual([4]);
        // Le reste, les ajouts les plus récents d'abord.
        expect(ids(blocks.recent)).toEqual([6, 5]);
    });

    it('sets aside only the cards shown, one row per block', () => {
        const list = [
            series(1, { toRead: true }),
            series(2, { toRead: true }),
            series(3, { toRead: true }),
        ];
        const blocks = homeBlocks(list, [], [], { perRow: 2 });
        // « À lire » en montre deux ; la troisième reste aux ajouts récents.
        expect(ids(blocks.toRead)).toEqual([3, 2, 1]);
        expect(ids(blocks.recent)).toEqual([1]);
    });

    it('shows the series read by the most people first, not the started ones', () => {
        const list = [
            series(1),
            series(2),
            series(3, { startedCount: 1, readCount: 0 }),
        ];
        const blocks = homeBlocks(
            list,
            [],
            [
                { id: 7, seriesIds: [1, 2, 3] },
                { id: 8, seriesIds: [2] },
            ],
        );

        expect(ids(blocks.family)).toEqual([2, 1]);
    });

    it('never suggests a series taken out of the suggestions', () => {
        const list = [
            series(1, { readCount: 3, startedCount: 3, genres: ['Horreur'] }),
            series(2, { genres: ['Horreur'], notForMe: true }),
            series(3, { notForMe: true }),
            series(4, { notForMe: true }),
        ];
        const blocks = homeBlocks(list, [], [{ id: 7, seriesIds: [3] }], {
            gems: [{ id: 4, rating: 4.8, reviews: 50 }],
        });
        expect(ids(blocks.forYou)).toEqual([]);
        expect(ids(blocks.family)).toEqual([]);
        expect(ids(blocks.gems)).toEqual([]);
        // Elles restent dans les ajouts récents (pas une suggestion).
        expect(ids(blocks.recent)).toContain(2);
    });

    it('orders the new volumes by the last reading', () => {
        const list = [
            series(1, { newCount: 1, lastReadAt: 100 }),
            series(2, { newCount: 1, lastReadAt: 300 }),
        ];
        expect(ids(homeBlocks(list, [], []).fresh)).toEqual([2, 1]);
    });
});
