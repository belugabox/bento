import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users, volumes } from '../src/db/schema';
import { listSeries, setSeriesStatus } from '../src/library/catalog';
import { saveProgress } from '../src/library/progress';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;

const ADMIN_VIEW = { id: 0, role: 'admin' as const, maxAge: null };

const userId = (sub: string) =>
    ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.oidcSubject, sub))
        .get()!.id;

const volumeId = (file: string) =>
    ctx.db
        .select({ id: volumes.id })
        .from(volumes)
        .where(eq(volumes.file, file))
        .get()!.id;

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
    await writeCbz(ctx.file('Gantz/Gantz T01.cbz'), {
        pages: 3,
        comicInfo: '<AgeRating>Mature 17+</AgeRating>',
    });
    await writeCbz(ctx.file('Gantz/Gantz T02.cbz'), { pages: 3 });
    await writeCbz(ctx.file('Kids/Kids T01.cbz'), {
        comicInfo: '<AgeRating>Everyone</AgeRating>',
    });
    await writeCbz(ctx.file('Unrated/Unrated T01.cbz'));
    await writeCbz(ctx.file('_draft/New/T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('GET /stats', () => {
    it('sums up the library and the reading', async () => {
        const gantz = listSeries(ctx.db, ADMIN_VIEW).find(
            (s) => s.name === 'Gantz',
        )!;
        setSeriesStatus(ctx.db, gantz.id, 'completed');
        saveProgress(ctx.db, userId('alice'), volumeId('Gantz/Gantz T01.cbz'), {
            completed: true,
        });
        saveProgress(ctx.db, userId('alice'), volumeId('Gantz/Gantz T02.cbz'), {
            page: 1,
        });
        saveProgress(ctx.db, userId('bob'), volumeId('Kids/Kids T01.cbz'), {
            page: 0,
        });

        const response = await api.request('/stats', {
            headers: { Cookie: admin },
        });
        const stats = await response.json();

        expect(stats.libraries).toEqual([
            expect.objectContaining({
                name: 'Mangas',
                series: 3,
                volumes: 4,
                pages: 3 + 3 + 2 + 2,
                lastScanAt: expect.any(String),
            }),
        ]);
        expect(stats.pendingDrafts).toBe(1);
        expect(stats.ratings).toEqual([
            { minAge: null, series: 1 },
            { minAge: 0, series: 1 },
            { minAge: 17, series: 1 },
        ]);
        expect(stats.statuses).toEqual({
            ongoing: 0,
            completed: 1,
            unknown: 2,
        });

        const alice = stats.readers.find(
            (r: { id: number }) => r.id === userId('alice'),
        );
        expect(alice).toMatchObject({
            completed: 1,
            inProgress: 1,
            lastReadAt: expect.any(String),
        });
        expect(stats.recent).toHaveLength(3);
        expect(stats.recent[0]).toMatchObject({
            seriesName: 'Kids',
            completed: false,
        });
        expect(stats.topSeries[0]).toMatchObject({
            name: 'Gantz',
            readers: 1,
            completed: 1,
        });
    });

    it('is for admins only', async () => {
        const reader = sessionCookie(ctx.db, 'reader', 'carol');
        const response = await api.request('/stats', {
            headers: { Cookie: reader },
        });
        expect(response.status).toBe(403);
    });
});
