import { describe, expect, it } from 'vitest';

import type { SeriesSummary } from '@/services/api';

import { forYou, sameAuthorSeries, similarSeries } from './suggestions';

const NOW = Date.UTC(2026, 10, 17);
const DAY = 24 * 60 * 60 * 1000;

const series = (
    id: number,
    name: string,
    extra: Partial<SeriesSummary> = {},
): SeriesSummary =>
    ({
        id,
        name,
        volumeCount: 3,
        readCount: 0,
        startedCount: 0,
        lastReadAt: null,
        lastAddedAt: null,
        genres: [],
        themes: [],
        format: 'Manga',
        writer: null,
        penciller: null,
        ...extra,
    }) as SeriesSummary;

const LIST = [
    series(1, 'Gantz', {
        genres: ['Science-fiction', 'Action'],
        themes: ['survie'],
        writer: 'Hiroya Oku',
    }),
    series(2, 'Gantz G', {
        genres: ['Science-fiction', 'Action'],
        themes: ['survie'],
        writer: 'Hiroya Oku / Keita Iizuka',
    }),
    series(3, 'Inuyashiki', {
        genres: ['Science-fiction', 'Drame'],
        writer: 'HIROYA OKU',
    }),
    series(4, 'One Piece', { genres: ['Action', 'Aventure'] }),
    series(5, 'Blacksad', { genres: ['Polar'], format: 'BD' }),
    series(6, 'Spirale', { genres: ['Horreur'], themes: ['survie'] }),
];

const names = (list: { series: SeriesSummary }[]) =>
    list.map((s) => s.series.name);

describe('similarSeries', () => {
    it('ranks by shared genres and themes, the rare ones first', () => {
        const similar = similarSeries(LIST[0]!, LIST);
        expect(names(similar)).toEqual([
            'Gantz G',
            'Spirale',
            'Inuyashiki',
            'One Piece',
        ]);
        // Le point commun le plus rare d'abord.
        expect(similar[0]!.reason).toBe('survie · Science-fiction');
        expect(similar[1]!.reason).toBe('survie');
    });

    it('puts the series already read last', () => {
        const list = LIST.map((s) =>
            s.id === 2 ? { ...s, readCount: 3, startedCount: 3 } : s,
        );
        expect(names(similarSeries(list[0]!, list)).at(-1)).toBe('Gantz G');
    });
});

describe('sameAuthorSeries', () => {
    it('finds a writer or artist in common, whatever the case', () => {
        const same = sameAuthorSeries(LIST[0]!, LIST);
        expect(names(same)).toEqual(['Gantz G', 'Inuyashiki']);
        expect(same.map((s) => s.reason)).toEqual(['Hiroya Oku', 'Hiroya Oku']);
        expect(sameAuthorSeries(LIST[3]!, LIST)).toEqual([]);
    });
});

describe('forYou', () => {
    it('suggests nothing without any reading', () => {
        expect(forYou(LIST, { now: NOW })).toEqual([]);
    });

    it('follows what the person read, and says why', () => {
        const list = LIST.map((s) =>
            s.id === 1
                ? {
                      ...s,
                      readCount: 3,
                      startedCount: 3,
                      lastReadAt: NOW - DAY,
                  }
                : s,
        );
        const suggestions = forYou(list, { now: NOW });
        // Pas la série lue ; d'abord la plus proche.
        expect(names(suggestions)[0]).toBe('Gantz G');
        expect(names(suggestions)).not.toContain('Gantz');
        expect(names(suggestions)).not.toContain('Blacksad');
        expect(suggestions[0]!.reason).toBe('Comme Gantz');
    });

    it('counts an abandoned series much less than a finished one', () => {
        const list = LIST.map((s) =>
            s.id === 5
                ? { ...s, readCount: 3, startedCount: 3 }
                : s.id === 6
                  ? {
                        ...s,
                        readCount: 2,
                        startedCount: 2,
                        lastReadAt: NOW - 90 * DAY,
                    }
                  : s,
        );
        // Spirale abandonnée : « survie » compte peu ; aucune autre série
        // n'est un polar.
        const suggestions = forYou(list, { now: NOW });
        expect(suggestions[0]!.reason).toBe('Comme Spirale');
        const fresh = forYou(
            list.map((s) => (s.id === 6 ? { ...s, lastReadAt: NOW - DAY } : s)),
            { now: NOW },
        );
        expect(fresh.find((s) => s.series.name === 'Gantz')!.reason).toBe(
            'Comme Spirale',
        );
    });
});
