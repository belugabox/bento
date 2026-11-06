import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { users } from '../src/db/schema';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let admin: string;
let alice: string;
let bob: string;
let gantzSeries: number;
let spiraleSeries: number;
let gantz: number[];

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
    return { status: response.status, body: await response.json() };
};

const info = (series: string, number: string) =>
    `<Series>${series}</Series><Number>${number}</Number>`;

const seriesOf = async (cookie: string, name: string) =>
    (await call('/series', cookie)).body.find(
        (s: { name: string }) => s.name === name,
    );

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
    alice = sessionCookie(ctx.db, 'reader', 'alice');
    bob = sessionCookie(ctx.db, 'reader', 'bob');
    for (const n of [1, 2, 3]) {
        await writeCbz(ctx.file(`Gantz/Gantz #0${n}.cbz`), {
            pages: 2,
            comicInfo: info('Gantz', String(n)),
        });
    }
    await writeCbz(ctx.file('Spirale/Spirale #01.cbz'), {
        comicInfo: info('Spirale', '1'),
    });
    await ctx.scanner.scan(ctx.library.id);
    gantzSeries = (await seriesOf(alice, 'Gantz')).id;
    spiraleSeries = (await seriesOf(alice, 'Spirale')).id;
    gantz = (await call(`/series/${gantzSeries}`, alice)).body.volumes.map(
        (v: { id: number }) => v.id,
    );
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('personal lists', () => {
    it('keeps the to-read list per person', async () => {
        const set = await call(`/series/${gantzSeries}/lists`, alice, {
            method: 'PUT',
            json: { toRead: true },
        });
        expect(set.body).toEqual({ toRead: true });

        expect(await seriesOf(alice, 'Gantz')).toMatchObject({ toRead: true });
        expect(
            (await call(`/series/${gantzSeries}`, alice)).body,
        ).toMatchObject({ toRead: true });
        // Bob n'a rien choisi.
        expect(await seriesOf(bob, 'Gantz')).toMatchObject({ toRead: false });

        await call(`/series/${gantzSeries}/lists`, alice, {
            method: 'PUT',
            json: { toRead: false },
        });
        expect(await seriesOf(alice, 'Gantz')).toMatchObject({
            toRead: false,
        });
    });

    it('refuses a series hidden from the person', async () => {
        const kid = sessionCookie(ctx.db, 'reader', 'kid');
        const kidId = ctx.db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.oidcSubject, 'kid'))
            .get()!.id;
        await call(`/users/${kidId}`, admin, {
            method: 'PATCH',
            json: { maxAge: 10 },
        });
        expect(
            (
                await call(`/series/${gantzSeries}/lists`, kid, {
                    method: 'PUT',
                    json: { toRead: true },
                })
            ).status,
        ).toBe(404);
    });
});

describe('collections', () => {
    it('are managed by the admin and seen by everyone', async () => {
        const created = await call('/collections', admin, {
            method: 'POST',
            json: { name: 'Pour les enfants' },
        });
        const id = created.body.id;
        expect(
            (
                await call('/collections', admin, {
                    method: 'POST',
                    json: { name: 'pour les enfants' },
                })
            ).status,
        ).toBe(409);
        await call(`/collections/${id}/series/${spiraleSeries}`, admin, {
            method: 'PUT',
            json: { member: true },
        });

        expect((await call('/collections', alice)).body).toEqual([
            { id, name: 'Pour les enfants', seriesCount: 1 },
        ]);
        expect((await seriesOf(alice, 'Spirale')).collectionIds).toEqual([id]);
        expect((await seriesOf(alice, 'Gantz')).collectionIds).toEqual([]);

        await call(`/collections/${id}`, admin, {
            method: 'PATCH',
            json: { name: 'Enfants' },
        });
        expect((await call('/collections', alice)).body[0].name).toBe(
            'Enfants',
        );
        await call(`/collections/${id}`, admin, { method: 'DELETE' });
        expect((await call('/collections', alice)).body).toEqual([]);
        expect((await seriesOf(alice, 'Spirale')).collectionIds).toEqual([]);
    });

    it('are read-only for readers', async () => {
        expect(
            (
                await call('/collections', alice, {
                    method: 'POST',
                    json: { name: 'X' },
                })
            ).status,
        ).toBe(403);
    });

    it('follow a series renamed at publication', async () => {
        const { id } = (
            await call('/collections', admin, {
                method: 'POST',
                json: { name: 'Favoris de la maison' },
            })
        ).body;
        await call(`/collections/${id}/series/${gantzSeries}`, admin, {
            method: 'PUT',
            json: { member: true },
        });
        await call(`/series/${gantzSeries}/lists`, alice, {
            method: 'PUT',
            json: { toRead: true },
        });
        const volumes = (await call(`/series/${gantzSeries}`, admin)).body
            .volumes;
        await ctx.files.updateComicInfo(
            ctx.library.id,
            volumes.map((v: { admin: { file: string } }) => ({
                path: v.admin.file,
                changes: { Series: 'Gantz Perfect' },
            })),
        );
        const moved = volumes.map(
            (v: { admin: { file: string } }) => v.admin.file,
        );
        await ctx.files.publish(ctx.library.id, moved);

        const renamed = await seriesOf(alice, 'Gantz Perfect');
        expect(renamed.id).not.toBe(gantzSeries);
        expect(renamed).toMatchObject({ toRead: true, collectionIds: [id] });
    });
});

describe('home', () => {
    it('shows the newest volume of each series', async () => {
        const { recent } = (await call('/home', alice)).body;
        expect(
            recent.map((v: { seriesName: string }) => v.seriesName).sort(),
        ).toEqual(['Gantz', 'Spirale']);
        expect(
            recent.find((v: { seriesName: string }) => v.seriesName === 'Gantz')
                .number,
        ).toBe('3');
    });

    it('offers the next volume of the series being read, to resume', async () => {
        const save = (volumeId: number, json: unknown) =>
            call(`/volumes/${volumeId}/progress`, alice, {
                method: 'PUT',
                json,
            });
        const resume = async () => (await call('/continue', alice)).body;
        await save(gantz[0]!, { completed: true });

        expect(await resume()).toEqual([
            expect.objectContaining({
                volumeId: gantz[1],
                seriesName: 'Gantz',
                page: null,
                readCount: 1,
                volumeCount: 3,
            }),
        ]);

        // Tome 2 commencé : c'est lui qu'on reprend, à sa page.
        await save(gantz[1]!, { page: 0 });
        expect(await resume()).toEqual([
            expect.objectContaining({ volumeId: gantz[1], page: 0 }),
        ]);

        // Toute la série lue : plus rien à reprendre.
        await save(gantz[1]!, { completed: true });
        await save(gantz[2]!, { completed: true });
        expect(await resume()).toEqual([]);
        expect((await call('/continue', bob)).body).toEqual([]);
    });
});
