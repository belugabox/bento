import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api';
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

        expect((await save(gantz[1]!, { completed: false })).body).toEqual({
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
        ).toMatchObject({ volumeCount: 3, readCount: 1 });
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
        expect((await call('/continue', bob)).body).toEqual([]);
    });
});
