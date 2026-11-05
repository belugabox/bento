import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users } from '../src/db/schema';
import { minAgeOf, seriesAge } from '../src/library/ageRating';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;
let reader: string;
let child: string;
let childId: number;
// Id des séries et de leur premier tome, par nom.
let ids: Record<string, { series: number; volume: number }>;

const rating = (value: string) => `<AgeRating>${value}</AgeRating>`;

const call = async (
    path: string,
    cookie: string,
    init: { method?: string; json?: unknown } = {},
) => {
    const response = await api.request(path, {
        method: init.method ?? 'GET',
        headers: {
            Cookie: cookie,
            ...(init.json !== undefined && {
                'Content-Type': 'application/json',
            }),
        },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
    const text = await response.text();
    return {
        status: response.status,
        body:
            text.startsWith('{') || text.startsWith('[')
                ? JSON.parse(text)
                : text,
    };
};

const visibleNames = async (cookie: string) =>
    (await call('/series', cookie)).body.map((s: { name: string }) => s.name);

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
    reader = sessionCookie(ctx.db, 'reader', 'parent');
    child = sessionCookie(ctx.db, 'reader', 'child');

    await writeCbz(ctx.file('Kids/Kids T01.cbz'), {
        comicInfo: rating('Everyone'),
    });
    await writeCbz(ctx.file('Teen/Teen T01.cbz'), {
        comicInfo: rating('Teen'),
    });
    // Un seul tome pour adultes suffit à classer la série.
    await writeCbz(ctx.file('Mixed/Mixed T01.cbz'), {
        comicInfo: rating('Everyone'),
    });
    await writeCbz(ctx.file('Mixed/Mixed T02.cbz'), {
        comicInfo: rating('Mature 17+'),
    });
    await writeCbz(ctx.file('Unrated/Unrated T01.cbz'));
    await ctx.scanner.scan(ctx.library.id);

    const series = (await call('/series', admin)).body as {
        id: number;
        name: string;
        coverVolumeId: number;
    }[];
    ids = Object.fromEntries(
        series.map((s) => [s.name, { series: s.id, volume: s.coverVolumeId }]),
    );
    childId = ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.oidcSubject, 'child'))
        .get()!.id;
    await call(`/users/${childId}`, admin, {
        method: 'PATCH',
        json: { maxAge: 13 },
    });
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('age ratings', () => {
    it('gives each ComicInfo rating a minimum age', () => {
        expect(minAgeOf('Everyone')).toBe(0);
        expect(minAgeOf('Everyone 10+')).toBe(10);
        expect(minAgeOf('Teen')).toBe(13);
        expect(minAgeOf('Mature 17+')).toBe(17);
        expect(minAgeOf('Adults Only 18+')).toBe(18);
        expect(minAgeOf('Unknown')).toBeNull();
        expect(minAgeOf('Rating Pending')).toBeNull();
        expect(minAgeOf(undefined)).toBeNull();
    });

    it('rates a series by its strictest volume, unless overridden', () => {
        expect(seriesAge(null, ['Everyone', 'Teen', undefined])).toEqual({
            ageRating: 'Teen',
            minAge: 13,
        });
        expect(seriesAge(null, ['Unknown', undefined])).toEqual({
            ageRating: 'Unknown',
            minAge: null,
        });
        expect(seriesAge('Everyone', ['Mature 17+'])).toEqual({
            ageRating: 'Everyone',
            minAge: 0,
        });
    });
});

describe('parental control', () => {
    it('shows everything to admins and to readers without a limit', async () => {
        const all = ['Kids', 'Mixed', 'Teen', 'Unrated'];
        expect(await visibleNames(admin)).toEqual(all);
        expect(await visibleNames(reader)).toEqual(all);
    });

    it('hides series above the limit and unrated ones', async () => {
        expect(await visibleNames(child)).toEqual(['Kids', 'Teen']);
        expect(
            (await call(`/series/${ids.Mixed!.series}`, admin)).body,
        ).toMatchObject({ ageRating: 'Mature 17+', minAge: 17 });
    });

    it('hides everything inside a hidden series', async () => {
        const { series, volume } = ids.Mixed!;
        for (const path of [
            `/series/${series}`,
            `/volumes/${volume}`,
            `/volumes/${volume}/cover`,
            `/volumes/${volume}/pages/0`,
        ]) {
            expect((await call(path, child)).status, path).toBe(404);
            expect((await call(path, reader)).status, path).toBe(200);
        }
        expect(
            (
                await call(`/volumes/${volume}/progress`, child, {
                    method: 'PUT',
                    json: { page: 0 },
                })
            ).status,
        ).toBe(404);
    });

    it('drops hidden volumes from « resume reading »', async () => {
        await call(`/users/${childId}`, admin, {
            method: 'PATCH',
            json: { maxAge: null },
        });
        await call(`/volumes/${ids.Mixed!.volume}/progress`, child, {
            method: 'PUT',
            json: { page: 0 },
        });
        expect((await call('/continue', child)).body).toHaveLength(1);

        await call(`/users/${childId}`, admin, {
            method: 'PATCH',
            json: { maxAge: 13 },
        });

        expect((await call('/continue', child)).body).toEqual([]);
    });

    it('lets an admin rate a series, and keeps it across scans', async () => {
        const path = `/series/${ids.Unrated!.series}/age-rating`;

        const set = await call(path, admin, {
            method: 'PUT',
            json: { ageRating: 'Everyone' },
        });
        expect(set.body).toMatchObject({ ageRating: 'Everyone', minAge: 0 });
        expect(await visibleNames(child)).toContain('Unrated');

        await ctx.scanner.scan(ctx.library.id);
        expect(await visibleNames(child)).toContain('Unrated');

        await call(path, admin, { method: 'PUT', json: { ageRating: null } });
        expect(await visibleNames(child)).not.toContain('Unrated');
    });

    it('keeps ratings and limits for admins, with checked values', async () => {
        const path = `/series/${ids.Unrated!.series}/age-rating`;
        expect(
            (
                await call(path, reader, {
                    method: 'PUT',
                    json: { ageRating: 'Teen' },
                })
            ).status,
        ).toBe(403);
        expect(
            (
                await call(path, admin, {
                    method: 'PUT',
                    json: { ageRating: 'PG-13' },
                })
            ).status,
        ).toBe(400);
        expect((await call('/users', reader)).status).toBe(403);
        expect(
            (
                await call(`/users/${childId}`, admin, {
                    method: 'PATCH',
                    json: { maxAge: 19 },
                })
            ).status,
        ).toBe(400);
        expect(
            (
                await call('/users/999', admin, {
                    method: 'PATCH',
                    json: { maxAge: 10 },
                })
            ).status,
        ).toBe(404);
    });

    it('lists accounts with their limit, and tells each person theirs', async () => {
        const list = (await call('/users', admin)).body;
        expect(list).toContainEqual(
            expect.objectContaining({ id: childId, maxAge: 13 }),
        );
        expect((await call('/me', child)).body).toMatchObject({ maxAge: 13 });
    });
});
