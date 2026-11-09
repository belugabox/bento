import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
import { SettingsStore } from '../src/settings';
import { authDeps, sessionCookie, setup, silent, writeCbz } from './helpers';

let ctx: Awaited<ReturnType<typeof setup>>;
let api: ReturnType<typeof createApi>;
let alice: string;
let bob: string;
// Tomes de Gantz (3 pages chacun) et de Spirale, dans l'ordre.
let gantz: number[];
let spirale: number;
let gantzSeries: number;

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

const save = (volumeId: number, json: unknown, cookie = alice) =>
    call(`/volumes/${volumeId}/progress`, cookie, { method: 'PUT', json });

const progressOf = async (volumeId: number, cookie = alice) =>
    (await call(`/volumes/${volumeId}`, cookie)).body.progress;

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
    alice = sessionCookie(ctx.db, 'reader', 'alice');
    bob = sessionCookie(ctx.db, 'reader', 'bob');
    for (const n of [1, 2, 3]) {
        await writeCbz(ctx.file(`Gantz/Gantz T0${n}.cbz`), { pages: 3 });
    }
    await writeCbz(ctx.file('Spirale/Spirale T01.cbz'), { pages: 3 });
    await ctx.scanner.scan(ctx.library.id);
    const series = (await call('/series', alice)).body;
    gantzSeries = series.find((s: { name: string }) => s.name === 'Gantz').id;
    gantz = (await call(`/series/${gantzSeries}`, alice)).body.volumes.map(
        (v: { id: number }) => v.id,
    );
    spirale = series.find(
        (s: { name: string }) => s.name === 'Spirale',
    ).coverVolumeId;
});

afterEach(async () => {
    await ctx.cleanup();
});

describe('reading progress', () => {
    it('remembers the page reached, per person', async () => {
        expect(await progressOf(gantz[0]!)).toBeNull();

        expect((await save(gantz[0]!, { page: 1 })).body).toEqual({
            progress: { page: 1, completed: false },
            // État d'avant, pour annuler.
            previous: { volumeId: gantz[0], progress: null },
        });

        expect(await progressOf(gantz[0]!)).toEqual({
            page: 1,
            completed: false,
        });
        expect(await progressOf(gantz[0]!, bob)).toBeNull();
    });

    it('marks the volume read on its last page, and keeps it read when rereading', async () => {
        await save(gantz[0]!, { page: 2 });
        expect(await progressOf(gantz[0]!)).toEqual({
            page: 2,
            completed: true,
        });

        await save(gantz[0]!, { page: 0 });
        expect(await progressOf(gantz[0]!)).toEqual({
            page: 0,
            completed: true,
        });
    });

    it('can mark a volume read or unread by hand', async () => {
        await save(gantz[1]!, { completed: true });
        expect(await progressOf(gantz[1]!)).toEqual({
            page: 2,
            completed: true,
        });

        expect(
            (await save(gantz[1]!, { completed: false })).body,
        ).toMatchObject({
            progress: null,
        });
        expect(await progressOf(gantz[1]!)).toBeNull();
    });

    it('keeps the page inside the volume and checks the request', async () => {
        await save(gantz[0]!, { page: 99 });
        expect(await progressOf(gantz[0]!)).toEqual({
            page: 2,
            completed: true,
        });
        expect((await save(999, { page: 0 })).status).toBe(404);
        expect((await save(gantz[0]!, { page: -1 })).status).toBe(400);
    });

    it('shows the progress in the series', async () => {
        await save(gantz[0]!, { completed: true });
        await save(gantz[1]!, { page: 1 });

        const list = (await call('/series', alice)).body;
        expect(
            list.find((s: { name: string }) => s.name === 'Gantz'),
        ).toMatchObject({ volumeCount: 3, readCount: 1, startedCount: 2 });
        expect(
            (await call('/series', bob)).body.find(
                (s: { name: string }) => s.name === 'Gantz',
            ),
        ).toMatchObject({ readCount: 0 });

        const details = (await call(`/series/${gantzSeries}`, alice)).body;
        expect(
            details.volumes.map((v: { progress: unknown }) => v.progress),
        ).toEqual([
            { page: 2, completed: true },
            { page: 1, completed: false },
            null,
        ]);
    });

    it('lists the volumes to resume, most recent first', async () => {
        await save(gantz[1]!, { page: 1 });
        await save(spirale, { page: 1 });
        await save(gantz[0]!, { completed: true });

        const { body } = await call('/continue', alice);

        expect(body.map((v: { volumeId: number }) => v.volumeId)).toEqual([
            spirale,
            gantz[1],
        ]);
        expect(body[0]).toMatchObject({
            seriesName: 'Spirale',
            page: 1,
            pageCount: 3,
        });
        // Avancement dans la série : un tome de Gantz lu sur trois.
        expect(body[1]).toMatchObject({ readCount: 1, volumeCount: 3 });
        expect((await call('/continue', bob)).body).toEqual([]);
    });

    it('keeps only the latest volume of each series to resume', async () => {
        await save(gantz[0]!, { page: 1 });
        await save(gantz[1]!, { page: 1 });

        const { body } = await call('/continue', alice);

        expect(body.map((v: { volumeId: number }) => v.volumeId)).toEqual([
            gantz[1],
        ]);
    });

    it('marks a whole series read or unread, per person', async () => {
        await save(gantz[1]!, { page: 1 });

        const read = await call(`/series/${gantzSeries}/read`, alice, {
            method: 'PUT',
            json: { read: true },
        });
        expect(read.body).toMatchObject({ volumes: 3, read: true });
        expect(read.body.previous).toEqual([
            { volumeId: gantz[0], progress: null },
            {
                volumeId: gantz[1],
                progress: {
                    page: 1,
                    completed: false,
                    updatedAt: expect.any(Number),
                },
            },
            { volumeId: gantz[2], progress: null },
        ]);
        expect(
            (await call(`/series/${gantzSeries}`, alice)).body.volumes.map(
                (v: { progress: { completed: boolean } | null }) =>
                    v.progress?.completed,
            ),
        ).toEqual([true, true, true]);
        expect(await progressOf(gantz[0]!, bob)).toBeNull();

        await call(`/series/${gantzSeries}/read`, alice, {
            method: 'PUT',
            json: { read: false },
        });
        for (const id of gantz) expect(await progressOf(id)).toBeNull();
        expect(
            (
                await call('/series/999/read', alice, {
                    method: 'PUT',
                    json: { read: true },
                })
            ).status,
        ).toBe(404);
    });

    it('marks a series read up to a volume', async () => {
        const read = await call(`/series/${gantzSeries}/read`, alice, {
            method: 'PUT',
            json: { read: true, upTo: gantz[1] },
        });
        expect(read.body).toMatchObject({ volumes: 2, read: true });
        expect((await progressOf(gantz[1]!))?.completed).toBe(true);
        expect(await progressOf(gantz[2]!)).toBeNull();
        expect(
            (
                await call(`/series/${gantzSeries}/read`, alice, {
                    method: 'PUT',
                    json: { read: true, upTo: 999 },
                })
            ).status,
        ).toBe(404);
    });

    it('restores the progress as it was, date included', async () => {
        await save(gantz[1]!, { page: 1 });
        const resume = async () =>
            (await call('/continue', alice)).body.map(
                (v: { volumeId: number }) => v.volumeId,
            );
        const before = await resume();

        const { body } = await call(`/series/${gantzSeries}/read`, alice, {
            method: 'PUT',
            json: { read: true },
        });
        expect(await resume()).toEqual([]);

        const restored = await call('/progress/restore', alice, {
            method: 'PUT',
            json: { items: body.previous },
        });
        expect(restored.body).toEqual({ restored: 3 });
        expect(await progressOf(gantz[1]!)).toEqual({
            page: 1,
            completed: false,
        });
        expect(await progressOf(gantz[0]!)).toBeNull();
        expect(await resume()).toEqual(before);
        // Les tomes d'une autre personne ne sont pas touchés.
        expect(await progressOf(gantz[1]!, bob)).toBeNull();
    });
});

describe('series readers', () => {
    const readers = async (cookie: string) =>
        (await call(`/series/${gantzSeries}/readers`, cookie)).body as {
            name: string;
            percent: number;
            avatarSeed: string | null;
        }[];

    it('lists the others who read enough of the series', async () => {
        // Alice : T01 fini et 2 pages du T02, soit 5 pages sur 9.
        await save(gantz[0]!, { page: 2 });
        await save(gantz[1]!, { page: 1 });
        // Bob : 1 page sur 9.
        await save(gantz[0]!, { page: 0 }, bob);

        expect(await readers(bob)).toEqual([
            expect.objectContaining({
                percent: 55,
                // Dernier tome ouvert : le T02, page 2 sur 3.
                current: {
                    number: '2',
                    title: null,
                    kind: 'volume',
                    page: 2,
                    pageCount: 3,
                    completed: false,
                },
            }),
        ]);
        // Jamais soi-même ; Bob reste sous le seuil choisi.
        new SettingsStore(ctx.db).update({ readByPercent: 50 });
        expect(await readers(alice)).toEqual([]);

        new SettingsStore(ctx.db).update({ readByPercent: 10 });
        expect(await readers(alice)).toEqual([
            expect.objectContaining({ percent: 11 }),
        ]);
    });
});
