import { describe, expect, it } from 'vitest';

import { groupSeries, letterOf } from './homeGroups';

const series = (
    id: number,
    name: string,
    extra: Partial<{
        format: string | null;
        age: number | null;
        lastAddedAt: string | null;
        readCount: number;
    }> = {},
) => ({
    id,
    name,
    volumeCount: 2,
    readCount: 0,
    startedCount: 0,
    lastAddedAt: null,
    ...extra,
});

/** Titres des blocs et leurs séries (par numéro). */
const shape = (groups: ReturnType<typeof groupSeries>) =>
    groups.map((g) => [g.title, g.list.map((s) => s.id)]);

describe('groupSeries', () => {
    it('groups by reading state, the current grouping', () => {
        const list = [series(1, 'A'), series(2, 'B', { readCount: 2 })];
        expect(shape(groupSeries(list, 'reading'))).toEqual([
            ['À découvrir', [1]],
            ['Déjà lues', [2]],
        ]);
    });

    it('groups by format and by age, the unknown last', () => {
        const list = [
            series(1, 'A', { format: 'Webtoon', age: 12 }),
            series(2, 'B', { format: null, age: null }),
            series(3, 'C', { format: 'Manga', age: 0 }),
        ];
        expect(shape(groupSeries(list, 'format'))).toEqual([
            ['Manga', [3]],
            ['Webtoon', [1]],
            ['Sans format', [2]],
        ]);
        expect(shape(groupSeries(list, 'age')).map(([title]) => title)).toEqual(
            [expect.any(String), expect.any(String), 'Âge inconnu'],
        );
        expect(shape(groupSeries(list, 'age'))[0]![1]).toEqual([3]);
    });

    it('groups by first letter, articles and accents ignored', () => {
        expect(letterOf('Le Sculpteur')).toBe('S');
        expect(letterOf('Écho')).toBe('E');
        expect(letterOf('20th Century Boys')).toBe('#');
        const list = [
            series(1, '20th Century Boys'),
            series(2, 'Le Sculpteur'),
            series(3, 'Akira'),
        ];
        expect(shape(groupSeries(list, 'letter'))).toEqual([
            ['A', [3]],
            ['S', [2]],
            ['#', [1]],
        ]);
    });

    it('groups by date added, the most recent first', () => {
        const now = new Date('2026-11-10T12:00:00Z');
        const list = [
            series(1, 'A', { lastAddedAt: '2024-05-01T00:00:00Z' }),
            series(2, 'B', { lastAddedAt: '2026-11-02T00:00:00Z' }),
            series(3, 'C', { lastAddedAt: '2026-03-01T00:00:00Z' }),
            series(4, 'D', { lastAddedAt: null }),
        ];
        expect(shape(groupSeries(list, 'added', { now }))).toEqual([
            ['Ce mois-ci', [2]],
            ['Cette année', [3]],
            ['2024', [1]],
            ['Date inconnue', [4]],
        ]);
    });

    it('groups by reader, a series in the block of each', () => {
        const list = [series(1, 'A'), series(2, 'B'), series(3, 'C')];
        const readers = [
            { id: 7, name: 'Léa', seriesIds: [1, 2] },
            { id: 8, name: 'Tom', seriesIds: [2] },
        ];
        expect(shape(groupSeries(list, 'reader', { readers }))).toEqual([
            ['Lu par Léa', [1, 2]],
            ['Lu par Tom', [2]],
            ['Lues par personne d’autre', [3]],
        ]);
    });

    it('puts everything in one untitled block for « Aucun »', () => {
        expect(shape(groupSeries([series(1, 'A')], 'none'))).toEqual([
            [null, [1]],
        ]);
    });
});
