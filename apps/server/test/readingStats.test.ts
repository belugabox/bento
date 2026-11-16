import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import {
    readProgress,
    readingSessions,
    series,
    users,
    volumes,
} from '../src/db/schema';
import { saveProgress } from '../src/library/progress';
import {
    readerStats,
    readingOverview,
    streaks,
    yearRecap,
} from '../src/library/readingStats';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;

// Lundi 16 novembre 2026, 12 h UTC (13 h à Paris).
const NOW = new Date('2026-11-16T12:00:00Z');
const PARIS = 60;
const DAY = 24 * 60 * 60 * 1000;

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

/** Séance de `minutes` commencée à `start` (UTC). */
const session = (
    user: string,
    file: string,
    start: string,
    minutes: number,
    pages: number,
    source: 'bento' | 'kavita' = 'bento',
) => {
    const startedAt = new Date(start);
    ctx.db
        .insert(readingSessions)
        .values({
            userId: userId(user),
            volumeId: volumeId(file),
            startedAt,
            endedAt: new Date(startedAt.getTime() + minutes * 60_000),
            pages,
            source,
        })
        .run();
};

/** Tome lu (ou commencé) par quelqu'un, à une date donnée. */
const progress = (user: string, file: string, completed: boolean, at: Date) => {
    saveProgress(
        ctx.db,
        userId(user),
        volumeId(file),
        completed ? { completed } : { page: 1 },
    );
    ctx.db
        .update(readProgress)
        .set({ updatedAt: at })
        .where(
            and(
                eq(readProgress.userId, userId(user)),
                eq(readProgress.volumeId, volumeId(file)),
            ),
        )
        .run();
};

beforeEach(async () => {
    ctx = await setup();
    api = createApi({
        db: ctx.db,
        logger: silent,
        version: '1.0.0',
        scanner: ctx.scanner,
        pages: ctx.pages,
        coversPath: ctx.coversPath,
        files: ctx.files,
        covers: ctx.covers,
        wikipedia: ctx.wikipedia,
        auth: authDeps(),
    });
    admin = sessionCookie(ctx.db, 'admin');
    sessionCookie(ctx.db, 'reader', 'alice');
    sessionCookie(ctx.db, 'reader', 'bob');
    for (const n of ['1', '2']) {
        await writeCbz(ctx.file(`Gantz/Gantz T0${n}.cbz`), {
            pages: 3,
            comicInfo: `<Series>Gantz</Series><Number>${n}</Number><Genre>Science-fiction, Action</Genre>`,
        });
    }
    await writeCbz(ctx.file('Kids/Kids T01.cbz'), {
        pages: 5,
        comicInfo:
            '<Series>Kids</Series><Number>1</Number><Genre>Aventure</Genre>',
    });
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('streaks', () => {
    it('counts consecutive days, still running when the last one was yesterday', () => {
        const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-15'];
        expect(streaks(days, '2026-11-16')).toEqual({ current: 1, best: 3 });
        expect(streaks(days, '2026-11-17')).toEqual({ current: 0, best: 3 });
        expect(streaks([], '2026-11-16')).toEqual({ current: 0, best: 0 });
    });
});

describe('reading overview', () => {
    beforeEach(() => {
        // Alice : dimanche soir à Paris (23 h 30 UTC = 0 h 30 lundi).
        session('alice', 'Gantz/Gantz T01.cbz', '2026-11-15T23:30:00Z', 20, 40);
        session('alice', 'Gantz/Gantz T02.cbz', '2026-11-14T18:00:00Z', 30, 60);
        // Il y a deux mois, et une séance de Kavita (sans heure fiable).
        session('alice', 'Kids/Kids T01.cbz', '2026-09-16T18:00:00Z', 10, 20);
        session(
            'bob',
            'Kids/Kids T01.cbz',
            '2026-11-10T00:00:00Z',
            15,
            0,
            'kavita',
        );
        progress('alice', 'Gantz/Gantz T01.cbz', true, NOW);
        progress('alice', 'Kids/Kids T01.cbz', true, new Date('2026-09-16'));
    });

    it('sums each day in local time, for the period and a whole year', () => {
        const week = readingOverview(ctx.db, {
            period: '7d',
            tz: PARIS,
            now: NOW,
        });
        // Le calendrier garde l'année : la séance de septembre y est.
        expect(week.daily).toEqual([
            {
                day: '2026-09-16',
                userId: userId('alice'),
                seconds: 600,
                pages: 20,
            },
            {
                day: '2026-11-10',
                userId: userId('bob'),
                seconds: 900,
                pages: 0,
            },
            {
                day: '2026-11-14',
                userId: userId('alice'),
                seconds: 1800,
                pages: 60,
            },
            // 23 h 30 UTC : déjà lundi à Paris.
            {
                day: '2026-11-16',
                userId: userId('alice'),
                seconds: 1200,
                pages: 40,
            },
        ]);
        expect(week.start).toBe(
            new Date(NOW.getTime() - 7 * DAY).toISOString(),
        );
    });

    it('places the Bento sessions of the period by weekday and hour', () => {
        const { hours } = readingOverview(ctx.db, {
            period: '7d',
            tz: PARIS,
            now: NOW,
        });
        expect(hours).toEqual(
            expect.arrayContaining([
                // Lundi 0 h et samedi 19 h, heure de Paris.
                { weekday: 1, hour: 0, seconds: 1200 },
                { weekday: 6, hour: 19, seconds: 1800 },
            ]),
        );
        // Ni la séance Kavita ni celle de septembre.
        expect(hours).toHaveLength(2);
    });

    it('gives each person their figures for the period', () => {
        const readers = (period: '7d' | 'all') =>
            readingOverview(ctx.db, { period, tz: PARIS, now: NOW }).readers;
        expect(
            readers('7d').find(
                (r) => r.name === 'reader' && r.id === userId('alice'),
            ),
        ).toMatchObject({
            seconds: 3000,
            pages: 100,
            sessions: 2,
            days: 2,
            completed: 1,
        });
        expect(
            readers('all').find((r) => r.id === userId('alice')),
        ).toMatchObject({ seconds: 3600, sessions: 3, days: 3, completed: 2 });
    });
});

describe('reader sheet', () => {
    it('tells pace, favourite genres, and finished, current or dropped series', () => {
        session('alice', 'Gantz/Gantz T01.cbz', '2026-11-15T10:00:00Z', 30, 60);
        session('alice', 'Gantz/Gantz T02.cbz', '2026-11-16T10:00:00Z', 30, 60);
        session('alice', 'Kids/Kids T01.cbz', '2026-08-01T10:00:00Z', 10, 0);
        progress('alice', 'Gantz/Gantz T01.cbz', true, NOW);
        progress(
            'alice',
            'Gantz/Gantz T02.cbz',
            true,
            new Date(NOW.getTime() - 60 * 60_000),
        );
        progress('alice', 'Kids/Kids T01.cbz', false, new Date('2026-08-01'));

        const sheet = readerStats(ctx.db, userId('alice'), {
            period: 'all',
            tz: PARIS,
            now: NOW,
        });

        expect(sheet).toMatchObject({
            seconds: 4200,
            sessions: 3,
            averageSessionSeconds: 1400,
            // Séances sans pages comptées à part : 120 pages en 60 min.
            pagesPerMinute: 2,
            streaks: { current: 2, best: 2 },
        });
        expect(sheet.genres.map((g) => g.name)).toEqual([
            'Action',
            'Science-fiction',
            'Aventure',
        ]);
        expect(
            sheet.series.map((s) => [s.name, s.read, s.volumes, s.state]),
        ).toEqual([
            ['Gantz', 2, 2, 'finished'],
            // Pas fini, pas ouvert depuis plus de 2 mois.
            ['Kids', 0, 1, 'abandoned'],
        ]);
        expect(sheet.history.map((h) => h.number)).toEqual(['1', '2', '1']);
        expect(sheet.history[2]).toMatchObject({
            seriesName: 'Kids',
            completed: false,
            seconds: 600,
        });
    });
});

describe('GET /stats/reading and /stats/readers/:id', () => {
    it('are for admins, with a known period', async () => {
        const reader = sessionCookie(ctx.db, 'reader', 'alice');
        const get = (path: string, cookie = admin) =>
            api.request(path, { headers: { Cookie: cookie } });

        expect((await get('/stats/reading?period=30d&tz=60')).status).toBe(200);
        expect((await get('/stats/reading?period=2y')).status).toBe(400);
        expect((await get('/stats/reading', reader)).status).toBe(403);
        const sheet = await get(`/stats/readers/${userId('bob')}?period=7d`);
        expect(sheet.status).toBe(200);
        expect(await sheet.json()).toMatchObject({
            name: 'reader',
            seconds: 0,
        });
        expect((await get('/stats/readers/9999')).status).toBe(404);
    });
});

describe('year recap', () => {
    it('sums a year of reading in local time, with its highlights', () => {
        // 31 décembre 2025, 23 h 30 à Paris : encore 2025.
        session('alice', 'Kids/Kids T01.cbz', '2025-12-31T22:30:00Z', 20, 30);
        // 1er janvier 2026, 0 h 30 à Paris.
        session('alice', 'Gantz/Gantz T01.cbz', '2025-12-31T23:30:00Z', 60, 90);
        session('alice', 'Gantz/Gantz T02.cbz', '2026-01-02T09:00:00Z', 30, 40);
        session('alice', 'Kids/Kids T01.cbz', '2026-03-10T17:00:00Z', 10, 15);
        progress('alice', 'Gantz/Gantz T01.cbz', true, new Date('2026-01-01'));
        progress('alice', 'Gantz/Gantz T02.cbz', true, new Date('2026-01-02'));

        const recap = yearRecap(ctx.db, userId('alice'), { tz: PARIS });

        expect(recap).toMatchObject({
            year: 2026,
            years: [2026, 2025],
            seconds: 6000,
            pages: 145,
            sessions: 3,
            longestSessionSeconds: 3600,
            days: 3,
            // 1er et 2 janvier.
            bestStreak: 2,
            completed: 2,
            seriesCount: 2,
            // Kids était déjà ouverte en 2025.
            newSeries: 1,
            finished: [{ name: 'Gantz' }],
            busiestMonth: { month: '2026-01', seconds: 5400 },
            favouriteMoment: { weekday: 4, hour: 0, seconds: 3600 },
        });
        expect(recap.topSeries.map((s) => [s.name, s.seconds])).toEqual([
            ['Gantz', 5400],
            ['Kids', 600],
        ]);
        expect(recap.topSeries[0]!.coverVolumeId).toBe(
            volumeId('Gantz/Gantz T01.cbz'),
        );
        expect(recap.genres[0]!.name).toBe('Action');
        expect(
            yearRecap(ctx.db, userId('alice'), { year: 2025, tz: PARIS }),
        ).toMatchObject({ seconds: 1200, newSeries: 1 });
    });
});

describe('GET /stats/me', () => {
    it('lets each person see their own figures, without the series they can no longer see', async () => {
        ctx.db
            .update(users)
            .set({ maxAge: 10 })
            .where(eq(users.id, userId('alice')))
            .run();
        ctx.db
            .update(series)
            .set({ age: 18 })
            .where(eq(series.name, 'Gantz'))
            .run();
        ctx.db
            .update(series)
            .set({ age: 0 })
            .where(eq(series.name, 'Kids'))
            .run();
        session('alice', 'Gantz/Gantz T01.cbz', '2026-11-15T10:00:00Z', 30, 60);
        session('alice', 'Kids/Kids T01.cbz', '2026-11-15T12:00:00Z', 10, 5);
        progress('alice', 'Gantz/Gantz T01.cbz', true, NOW);
        progress('alice', 'Kids/Kids T01.cbz', true, NOW);
        const alice = sessionCookie(ctx.db, 'reader', 'alice');
        const get = (path: string, cookie = alice) =>
            api.request(path, { headers: { Cookie: cookie } });

        const response = await get('/stats/me?period=all&tz=60');
        expect(response.status).toBe(200);
        const sheet = (await response.json()) as {
            seconds: number;
            series: { name: string }[];
            history: { seriesName: string }[];
            genres: { name: string }[];
        };
        // Le temps reste compté, mais Gantz n'apparaît nulle part.
        expect(sheet.seconds).toBe(2400);
        expect(sheet.series.map((s) => s.name)).toEqual(['Kids']);
        expect(sheet.history.map((h) => h.seriesName)).toEqual(['Kids']);
        expect(sheet.genres.map((g) => g.name)).toEqual(['Aventure']);

        const year = (await (await get('/stats/me/year?tz=60')).json()) as {
            topSeries: { name: string }[];
        };
        expect(year.topSeries.map((s) => s.name)).toEqual(['Kids']);

        // Le bilan d'une autre personne : réservé aux admins.
        expect((await get(`/stats/readers/${userId('bob')}/year`)).status).toBe(
            403,
        );
        expect(
            (await get(`/stats/readers/${userId('alice')}/year`, admin)).status,
        ).toBe(200);
    });
});
