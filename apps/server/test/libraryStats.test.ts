import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
    formats,
    readingSessions,
    series,
    sourceRatings,
    users,
    volumes,
} from '../src/db/schema';
import { libraryStats } from '../src/library/libraryStats';
import { saveProgress } from '../src/library/progress';
import { readingRankings } from '../src/library/rankings';
import { sessionCookie, setup, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;

const NOW = new Date('2026-11-16T12:00:00Z');

const userId = (username: string) =>
    ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .get()!.id;

const volumeId = (file: string) =>
    ctx.db
        .select({ id: volumes.id })
        .from(volumes)
        .where(eq(volumes.file, file))
        .get()!.id;

const seriesId = (name: string) =>
    ctx.db
        .select({ id: series.id })
        .from(series)
        .where(eq(series.name, name))
        .get()!.id;

const session = (user: string, file: string, start: string, minutes: number) =>
    ctx.db
        .insert(readingSessions)
        .values({
            userId: userId(user),
            volumeId: volumeId(file),
            startedAt: new Date(start),
            endedAt: new Date(new Date(start).getTime() + minutes * 60_000),
            pages: minutes * 3,
        })
        .run();

const comicInfo = (name: string, number: string, extra: string) =>
    `<Series>${name}</Series><Number>${number}</Number>${extra}`;

beforeEach(async () => {
    ctx = await setup();
    sessionCookie(ctx.db, 'reader', 'alice');
    sessionCookie(ctx.db, 'reader', 'bob');
    const gantz =
        '<Genre>Science-fiction</Genre><Writer>Hiroya Oku</Writer><Penciller>Hiroya Oku</Penciller><Publisher>Tonkam</Publisher>';
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), {
        comicInfo: comicInfo('Gantz', '1', gantz),
    });
    await writeCbz(ctx.file('Gantz/Gantz T02.cbz'), {
        comicInfo: comicInfo('Gantz', '2', gantz),
    });
    await writeCbz(ctx.file('Inuyashiki/Inuyashiki T01.cbz'), {
        comicInfo: comicInfo(
            'Inuyashiki',
            '1',
            '<Genre>Science-fiction, Drame</Genre><Writer>HIROYA OKU / Ji-Hoon Jeong</Writer><Publisher>Pika</Publisher>',
        ),
    });
    await writeCbz(ctx.file('Spirale/Spirale T01.cbz'), {
        comicInfo: comicInfo(
            'Spirale',
            '1',
            '<Genre>Horreur</Genre><Writer>Junji Ito</Writer><Publisher>Tonkam</Publisher>',
        ),
    });
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('library stats', () => {
    it('counts formats, genres, publishers, authors and growth', () => {
        const manga = ctx.db
            .select({ id: formats.id })
            .from(formats)
            .where(eq(formats.name, 'Manga'))
            .get()!.id;
        ctx.db
            .update(series)
            .set({ formatId: manga })
            .where(eq(series.name, 'Gantz'))
            .run();
        session('alice', 'Gantz/Gantz T01.cbz', '2026-11-15T18:00:00Z', 30);

        const stats = libraryStats(ctx.db);

        const month = NOW.toISOString().slice(0, 7);
        expect(stats.growth.at(-1)!.volumes).toBe(4);
        expect(stats.growth.at(-1)!.series).toBe(3);
        expect(stats.growth.at(-1)!.month >= month).toBe(true);
        expect(stats.formats.map((f) => [f.name, f.series, f.volumes])).toEqual(
            expect.arrayContaining([
                ['Manga', 1, 2],
                ['Sans format', 2, 2],
            ]),
        );
        // Possédé (séries) et lu (temps de toute la famille).
        expect(stats.genres[0]).toEqual({
            name: 'Science-fiction',
            series: 2,
            seconds: 1800,
        });
        expect(stats.publishers).toEqual([
            { name: 'Tonkam', series: 2 },
            { name: 'Pika', series: 1 },
        ]);
        // Une personne par nom, scénariste et dessinateur comptés une fois.
        expect(stats.authors[0]).toEqual({ name: 'Hiroya Oku', series: 2 });
        // « A / B » : deux personnes (« Ji-Hoon » reste un nom).
        expect(stats.authors).toContainEqual({
            name: 'Ji-Hoon Jeong',
            series: 1,
        });
    });

    it('lists the series nobody has opened', () => {
        saveProgress(ctx.db, userId('bob'), volumeId('Gantz/Gantz T02.cbz'), {
            page: 1,
        });
        expect(
            libraryStats(ctx.db)
                .dormant.map((s) => s.name)
                .sort(),
        ).toEqual(['Inuyashiki', 'Spirale']);
    });
});

describe('rankings', () => {
    beforeEach(() => {
        session('alice', 'Gantz/Gantz T01.cbz', '2026-11-15T18:00:00Z', 60);
        session('bob', 'Gantz/Gantz T02.cbz', '2026-11-14T18:00:00Z', 20);
        session('bob', 'Spirale/Spirale T01.cbz', '2026-11-13T18:00:00Z', 30);
        // Hors des 7 jours.
        session('alice', 'Spirale/Spirale T01.cbz', '2026-10-01T18:00:00Z', 90);
    });

    it('ranks series by reading time, for everyone and for each person', () => {
        const week = readingRankings(ctx.db, {
            period: '7d',
            tz: 60,
            now: NOW,
        });
        expect(
            week.topSeries.map((s) => [s.name, s.seconds, s.readers.length]),
        ).toEqual([
            ['Gantz', 4800, 2],
            ['Spirale', 1800, 1],
        ]);
        expect(
            week.perReader.map((r) => [r.id, r.series.map((s) => s.name)]),
        ).toEqual([
            [userId('alice'), ['Gantz']],
            [userId('bob'), ['Spirale', 'Gantz']],
        ]);
        const all = readingRankings(ctx.db, {
            period: 'all',
            tz: 60,
            now: NOW,
        });
        expect(all.topSeries[0]).toMatchObject({
            name: 'Spirale',
            seconds: 7200,
        });
    });

    it('sets site ratings against the family reading', () => {
        const rate = (
            name: string,
            sheet: string,
            value: number,
            count: number,
        ) => {
            ctx.db
                .update(series)
                .set({ sources: `manga-news:${sheet}` })
                .where(eq(series.id, seriesId(name)))
                .run();
            ctx.db
                .insert(sourceRatings)
                .values({
                    site: 'manga-news',
                    sourceId: sheet,
                    value,
                    count,
                    updatedAt: NOW,
                })
                .run();
        };
        rate('Gantz', 'Gantz', 4.2, 300);
        rate('Inuyashiki', 'Inuyashiki', 4.5, 120);
        // Trop peu d'avis pour compter.
        rate('Spirale', 'Spirale', 5, 3);
        saveProgress(ctx.db, userId('bob'), volumeId('Gantz/Gantz T02.cbz'), {
            page: 1,
        });

        const { bestRated, unreadGems } = readingRankings(ctx.db, {
            period: 'all',
            tz: 60,
            now: NOW,
        });
        expect(bestRated.map((s) => [s.name, s.rating, s.readers])).toEqual([
            ['Inuyashiki', 4.5, 0],
            ['Gantz', 4.2, 1],
        ]);
        expect(unreadGems.map((s) => s.name)).toEqual(['Inuyashiki']);
    });
});
