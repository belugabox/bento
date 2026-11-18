import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApi } from '../src/api';
import { volumes } from '../src/db/schema';
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
        // Dernière lecture de la personne (tri « Lues récemment »).
        const { lastReadAt } = list.find(
            (s: { name: string }) => s.name === 'Gantz',
        );
        expect(Math.abs(Date.now() - lastReadAt)).toBeLessThan(60_000);
        expect(
            (await call('/series', bob)).body.find(
                (s: { name: string }) => s.name === 'Gantz',
            ),
        ).toMatchObject({ readCount: 0, lastReadAt: null });

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

    it('lists every series in progress, not only twelve', async () => {
        for (let n = 1; n <= 12; n++) {
            await writeCbz(ctx.file(`Série ${n}/Série ${n} T01.cbz`));
        }
        await ctx.scanner.scan(ctx.library.id);
        const series = (await call('/series', alice)).body as {
            coverVolumeId: number;
        }[];
        for (const s of series) await save(s.coverVolumeId, { page: 0 });

        const resume = (await call('/continue', alice)).body;
        // 12 séries ajoutées, plus Gantz et Spirale.
        expect(resume).toHaveLength(14);
    });

    it('lists a volume being reread, until its last page', async () => {
        for (const id of gantz) await save(id, { completed: true });
        // Tout lu : rien à reprendre.
        expect((await call('/continue', alice)).body).toEqual([]);

        // Relecture du tome 1 : il reste lu, et il est en cours.
        await save(gantz[0]!, { page: 1 });
        const { body } = await call('/continue', alice);
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
            volumeId: gantz[0],
            page: 1,
            readCount: 3,
        });

        // Relu jusqu'au bout : plus en cours.
        await save(gantz[0]!, { page: 2 });
        expect((await call('/continue', alice)).body).toEqual([]);
    });

    it('lists a reread volume once, even with an unread volume after it', async () => {
        await save(gantz[0]!, { completed: true });
        await save(gantz[0]!, { page: 0 });

        const { body } = await call('/continue', alice);
        // Le tome relu, pas aussi le tome 2 à ouvrir.
        expect(body.map((v: { volumeId: number }) => v.volumeId)).toEqual([
            gantz[0],
        ]);
    });

    it('follows a reread: the next volume to reread, until the last one', async () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        try {
            vi.setSystemTime(new Date('2026-11-01T10:00:00Z'));
            for (const id of gantz) await save(id, { completed: true });
            // « Relire » une heure plus tard.
            vi.setSystemTime(new Date('2026-11-01T11:00:00Z'));
            const lists = await call(`/series/${gantzSeries}/lists`, alice, {
                method: 'PUT',
                json: { rereading: true },
            });
            expect(lists.body).toMatchObject({ rereading: true });
            const resume = async () =>
                (await call('/continue', alice)).body.map(
                    (v: {
                        volumeId: number;
                        page: number | null;
                        rereading: boolean;
                    }) => [v.volumeId, v.page, v.rereading],
                );
            expect(await resume()).toEqual([[gantz[0], null, true]]);
            expect(
                (await call(`/series/${gantzSeries}`, alice)).body.rereadNextId,
            ).toBe(gantz[0]);

            vi.setSystemTime(new Date('2026-11-01T11:10:00Z'));
            await save(gantz[0]!, { page: 1 });
            expect(await resume()).toEqual([[gantz[0], 1, true]]);

            // Tome 1 relu : le tome 2.
            await save(gantz[0]!, { page: 2 });
            expect(await resume()).toEqual([[gantz[1], null, true]]);

            // Les autres relus : la relecture s'arrête d'elle-même.
            await save(gantz[1]!, { page: 2 });
            await save(gantz[2]!, { page: 2 });
            expect(await resume()).toEqual([]);
            expect(
                (await call('/series', alice)).body.find(
                    (s: { name: string }) => s.name === 'Gantz',
                ),
            ).toMatchObject({ rereading: false });
            expect(
                (await call(`/series/${gantzSeries}`, alice)).body.rereadNextId,
            ).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops a reread on demand', async () => {
        for (const id of gantz) await save(id, { completed: true });
        await call(`/series/${gantzSeries}/lists`, alice, {
            method: 'PUT',
            json: { rereading: true },
        });
        await call(`/series/${gantzSeries}/lists`, alice, {
            method: 'PUT',
            json: { rereading: false },
        });
        expect((await call('/continue', alice)).body).toEqual([]);
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

describe('reading done offline', () => {
    it('keeps a more recent reading over an older one sent later', async () => {
        // Sur un autre appareil, maintenant : page 2.
        await save(gantz[0]!, { page: 2 });
        // Envoyée au retour du réseau, une lecture d'il y a une heure.
        const anHourAgo = Date.now() - 3_600_000;
        const late = await save(gantz[0]!, { page: 1, at: anHourAgo });
        expect(late.body.progress).toEqual({ page: 2, completed: true });
        expect(await progressOf(gantz[0]!)).toEqual({
            page: 2,
            completed: true,
        });

        // Plus récente que celle du serveur : enregistrée, à son heure.
        await save(gantz[1]!, { page: 0, at: anHourAgo });
        await save(gantz[1]!, { page: 1, at: anHourAgo + 60_000 });
        expect(await progressOf(gantz[1]!)).toEqual({
            page: 1,
            completed: false,
        });
        const continued = (await call('/continue', alice)).body;
        expect(new Date(continued[0].updatedAt).getTime()).toBe(
            anHourAgo + 60_000,
        );
    });
});

describe('new volumes', () => {
    it('counts the volumes added since the last reading of the series', async () => {
        // Alice a lu le T01 ; le T03 arrive après.
        await save(gantz[0]!, { completed: true });
        ctx.db
            .update(volumes)
            .set({ addedAt: new Date(Date.now() + 60_000) })
            .where(eq(volumes.id, gantz[2]!))
            .run();

        const gantzOf = async (cookie: string) =>
            (await call('/series', cookie)).body.find(
                (s: { name: string }) => s.name === 'Gantz',
            );
        expect((await gantzOf(alice)).newCount).toBe(1);
        // Bob n'a rien lu : pas de nouveauté pour lui.
        expect((await gantzOf(bob)).newCount).toBe(0);
        // La suite à ouvrir le dit aussi.
        expect((await call('/continue', alice)).body).toEqual([
            expect.objectContaining({ seriesName: 'Gantz', newCount: 1 }),
        ]);

        // Une lecture plus récente : plus rien de nouveau.
        await save(gantz[1]!, { page: 1 });
        ctx.db
            .update(volumes)
            .set({ addedAt: new Date(Date.now() - 60_000) })
            .where(eq(volumes.id, gantz[2]!))
            .run();
        expect((await gantzOf(alice)).newCount).toBe(0);
    });
});

describe('family readers (home filter)', () => {
    it('lists the others with the series they read enough of', async () => {
        // Alice : tout Spirale, 1 page de Gantz (1 sur 9, sous 20 %).
        await save(spirale, { completed: true });
        await save(gantz[0]!, { page: 0 });
        new SettingsStore(ctx.db).update({ readByPercent: 20 });

        const spiraleSeries = (await call('/series', bob)).body.find(
            (s: { name: string }) => s.name === 'Spirale',
        ).id;
        expect((await call('/readers', bob)).body).toEqual([
            expect.objectContaining({ seriesIds: [spiraleSeries] }),
        ]);
        // Jamais soi-même ; Bob n'a rien lu.
        expect((await call('/readers', alice)).body).toEqual([]);
    });
});
